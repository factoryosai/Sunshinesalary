import { onRequest, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// Helper: Calculate previous month string
function getPreviousMonthStr(yearMonthStr: string): string {
  const [year, month] = yearMonthStr.split("_").map(Number);
  if (month === 1) {
    return `${year - 1}_12`;
  } else {
    const prevMonth = month - 1;
    return `${year}_${prevMonth < 10 ? "0" + prevMonth : prevMonth}`;
  }
}

// Helper: Calculate next month string
function getNextMonthStr(yearMonthStr: string): string {
  const [year, month] = yearMonthStr.split("_").map(Number);
  if (month === 12) {
    return `${year + 1}_01`;
  } else {
    const nextMonth = month + 1;
    return `${year}_${nextMonth < 10 ? "0" + nextMonth : nextMonth}`;
  }
}

/**
 * Core Salary Calculation Engine
 * 
 * Implements the formula:
 * final_salary = (monthlySalary / 26) * dutyDays + overtimeAmount - totalWithdrawals - carryForwardIn
 * 
 * Automatically flags negative balances as carryForwardOut and propagates it to the next month's carryForwardIn.
 */
async function calculateSalaryInternal(employeeId: string, yearMonthStr: string): Promise<any> {
  const employeeRef = db.collection("employees").doc(employeeId);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) {
    throw new Error(`Employee ${employeeId} not found`);
  }
  const employeeData = employeeSnap.data() || {};
  const monthlySalary = employeeData.monthlySalary || 0;

  const [year, month] = yearMonthStr.split("_").map(Number);
  const recordRef = employeeRef.collection("monthlyRecords").doc(yearMonthStr);
  const recordSnap = await recordRef.get();

  let dutyDays: number | null = null;
  let dutyDaysAdded = false;
  let overtimeAmount = 0;
  
  if (recordSnap.exists) {
    const data = recordSnap.data() || {};
    if (typeof data.dutyDays === "number") {
      dutyDays = data.dutyDays;
      dutyDaysAdded = true;
    }
    overtimeAmount = typeof data.overtimeAmount === "number" ? data.overtimeAmount : 0;
  }

  // Calculate carryForwardIn from the previous month
  const prevMonthStr = getPreviousMonthStr(yearMonthStr);
  const prevRecordRef = employeeRef.collection("monthlyRecords").doc(prevMonthStr);
  const prevRecordSnap = await prevRecordRef.get();
  let carryForwardIn = 0;
  
  if (prevRecordSnap.exists) {
    const prevData = prevRecordSnap.data() || {};
    // Only carry forward if the previous month's final salary was negative
    if (prevData.finalSalary < 0) {
      carryForwardIn = Math.abs(prevData.finalSalary);
    }
  }

  // Query withdrawals for this month
  const withdrawalsRef = employeeRef.collection("withdrawals");
  const withdrawalsSnap = await withdrawalsRef.where("monthlyRecordId", "==", yearMonthStr).get();
  let totalWithdrawals = 0;
  
  withdrawalsSnap.forEach((docSnap) => {
    const wData = docSnap.data();
    totalWithdrawals += (wData.amount || 0);
  });

  // Apply Salary Formula
  let totalEarned = 0;
  let finalSalary = 0;

  if (dutyDaysAdded && dutyDays !== null) {
    const perDaySalary = monthlySalary / 26;
    totalEarned = perDaySalary * dutyDays;
    finalSalary = totalEarned + overtimeAmount - totalWithdrawals - carryForwardIn;
  } else {
    totalEarned = 0;
    overtimeAmount = 0;
    finalSalary = -totalWithdrawals - carryForwardIn;
  }

  // Handle negative balance carryForwardOut
  let carryForwardOut = 0;
  if (finalSalary < 0) {
    carryForwardOut = Math.abs(finalSalary);
  }

  const updatedRecord: any = {
    year,
    month,
    overtimeAmount,
    carryForwardIn: Math.round(carryForwardIn * 100) / 100,
    totalEarned: Math.round(totalEarned * 100) / 100,
    totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
    finalSalary: Math.round(finalSalary * 100) / 100,
    carryForwardOut: Math.round(carryForwardOut * 100) / 100,
    updatedBy: "system-calculation",
    updatedAt: FieldValue.serverTimestamp()
  };

  if (dutyDaysAdded && dutyDays !== null) {
    updatedRecord.dutyDays = dutyDays;
  }

  await recordRef.set(updatedRecord, { merge: true });

  // Propagate carry forward to the next month recursively
  const nextMonthStr = getNextMonthStr(yearMonthStr);
  const nextRecordRef = employeeRef.collection("monthlyRecords").doc(nextMonthStr);
  const nextRecordSnap = await nextRecordRef.get();
  if (nextRecordSnap.exists) {
    await calculateSalaryInternal(employeeId, nextMonthStr);
  }

  return updatedRecord;
}

/**
 * Triggered automatically when any monthly record document is written to Firestore.
 */
export const onMonthlyRecordWrite = onDocumentWritten(
  "employees/{employeeId}/monthlyRecords/{recordId}",
  async (event) => {
    const employeeId = event.params.employeeId;
    const recordId = event.params.recordId;
    
    // Guard against calculation infinite recursion loop
    const afterData = event.data?.after?.data();
    if (afterData && afterData.updatedBy === "system-calculation") {
      return;
    }

    try {
      await calculateSalaryInternal(employeeId, recordId);
    } catch (error) {
      console.error(`Error in onMonthlyRecordWrite for employee ${employeeId}, record ${recordId}:`, error);
    }
  }
);

/**
 * Triggered automatically when any withdrawal is logged/modified/deleted.
 */
export const onWithdrawalWrite = onDocumentWritten(
  "employees/{employeeId}/withdrawals/{withdrawalId}",
  async (event) => {
    const employeeId = event.params.employeeId;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    
    const recordId = afterData?.monthlyRecordId || beforeData?.monthlyRecordId;
    if (!recordId) {
      console.warn(`No monthlyRecordId found for withdrawal ${event.params.withdrawalId}`);
      return;
    }

    try {
      await calculateSalaryInternal(employeeId, recordId);
    } catch (error) {
      console.error(`Error in onWithdrawalWrite for employee ${employeeId}, record ${recordId}:`, error);
    }
  }
);

/**
 * HTTPS Callable Cloud Function for manually triggering calculation.
 */
export const recalculateSalary = onCall(async (request) => {
  const { employeeId, yearMonth } = request.data;
  if (!employeeId || !yearMonth) {
    throw new Error("Missing parameters: employeeId and yearMonth are required.");
  }

  try {
    const record = await calculateSalaryInternal(employeeId, yearMonth);
    return { success: true, record };
  } catch (error: any) {
    console.error("Recalculate Callable Function error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * HTTPS Request (REST) Cloud Function for manually triggering calculation.
 */
export const recalculateSalaryHttp = onRequest(async (req, res) => {
  const { employeeId, yearMonth } = req.body;
  if (!employeeId || !yearMonth) {
    res.status(400).send({ error: "Missing parameters: employeeId and yearMonth are required in body." });
    return;
  }

  try {
    const record = await calculateSalaryInternal(employeeId, yearMonth);
    res.status(200).send({ success: true, record });
  } catch (error: any) {
    console.error("Recalculate HTTP Function error:", error);
    res.status(500).send({ error: error.message });
  }
});
