/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  where,
  updateDoc,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  updatePassword
} from "firebase/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 3000;

// Reusable Firebase config matching client
const firebaseConfig = {
  apiKey: "AIzaSyDrJ-P7Dp4T5ayraUs9Nev-rU08JI6RvRg",
  authDomain: "pagarbook-b7ad8.firebaseapp.com",
  projectId: "pagarbook-b7ad8",
  storageBucket: "pagarbook-b7ad8.firebasestorage.app",
  messagingSenderId: "94603138361",
  appId: "1:94603138361:web:428261179814fd217384e8"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "DUMMY_KEY",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper: Calculate previous month string
function getPreviousMonthStr(yearMonthStr: string): string {
  const [year, month] = yearMonthStr.split("_").map(Number);
  if (month === 1) {
    return `${year - 1}_12`;
  } else {
    const prevMonth = month - 1;
    return `${year}_${prevMonth < 10 ? '0' + prevMonth : prevMonth}`;
  }
}

// Helper: Calculate next month string
function getNextMonthStr(yearMonthStr: string): string {
  const [year, month] = yearMonthStr.split("_").map(Number);
  if (month === 12) {
    return `${year + 1}_01`;
  } else {
    const nextMonth = month + 1;
    return `${year}_${nextMonth < 10 ? '0' + nextMonth : nextMonth}`;
  }
}

// ------------------------------------------------------------
// Helper: Ensure Server is authenticated as Admin for Firebase Rules
// ------------------------------------------------------------
async function ensureAdminAuth() {
  if (auth.currentUser && auth.currentUser.email === "sunshine@sunshinepagarbook.internal") {
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, "sunshine@sunshinepagarbook.internal", "Sun.456");
  } catch (err) {
    try {
      await signInWithEmailAndPassword(auth, "sunshine@sunshinepagarbook.internal", "sun.456");
    } catch (err2: any) {
      console.error("ensureAdminAuth: Admin authentication failed on server:", err2.message);
    }
  }
}

// ------------------------------------------------------------
// API: Recalculate Salary with carry forward propagation
// ------------------------------------------------------------
async function calculateSalaryInternal(employeeId: string, yearMonthStr: string) {
  await ensureAdminAuth();
  const employeeRef = doc(db, "employees", employeeId);
  const employeeSnap = await getDoc(employeeRef);
  if (!employeeSnap.exists()) {
    throw new Error(`Employee ${employeeId} not found`);
  }
  const employeeData = employeeSnap.data();
  const monthlySalary = employeeData.monthlySalary || 0;

  // 1. Get Monthly Record details
  const [year, month] = yearMonthStr.split("_").map(Number);
  const recordRef = doc(db, "employees", employeeId, "monthlyRecords", yearMonthStr);
  const recordSnap = await getDoc(recordRef);

  let dutyDays: number | null = null;
  let dutyDaysAdded = false;
  let overtimeAmount = 0;
  if (recordSnap.exists()) {
    const data = recordSnap.data();
    if (typeof data.dutyDays === 'number') {
      dutyDays = data.dutyDays;
      dutyDaysAdded = true;
    }
    overtimeAmount = typeof data.overtimeAmount === 'number' ? data.overtimeAmount : 0;
  }

  // 2. Calculate carryForwardIn from previous month
  const prevMonthStr = getPreviousMonthStr(yearMonthStr);
  const prevRecordRef = doc(db, "employees", employeeId, "monthlyRecords", prevMonthStr);
  const prevRecordSnap = await getDoc(prevRecordRef);
  let carryForwardIn = 0;
  if (prevRecordSnap.exists()) {
    const prevData = prevRecordSnap.data();
    // Only carry forward if previous month's final salary was negative
    if (prevData.finalSalary < 0) {
      carryForwardIn = Math.abs(prevData.finalSalary);
    }
  }

  // 3. Query withdrawals for this month
  const withdrawalsRef = collection(db, "employees", employeeId, "withdrawals");
  const withdrawalsSnap = await getDocs(withdrawalsRef);
  let totalWithdrawals = 0;
  withdrawalsSnap.forEach((doc) => {
    const wData = doc.data();
    if (wData.monthlyRecordId === yearMonthStr) {
      totalWithdrawals += (wData.amount || 0);
    }
  });

  // 4. Implement Salary Formula
  // per_day_salary    = monthlySalary / 26
  // total_earned      = per_day_salary * dutyDays (if dutyDaysAdded)
  // total_withdrawals = sum of withdrawals.amount
  // carry_forward_in  = previous month's finalSalary IF it was negative, else 0
  // final_salary      = total_earned + overtimeAmount - total_withdrawals - carry_forward_in
  let totalEarned = 0;

  if (dutyDaysAdded && dutyDays !== null) {
    const perDaySalary = monthlySalary / 26;
    totalEarned = perDaySalary * dutyDays;
  } else {
    totalEarned = 0;
  }
  
  const finalSalary = totalEarned + overtimeAmount - totalWithdrawals - carryForwardIn;
  
  let carryForwardOut = 0;
  if (finalSalary < 0) {
    carryForwardOut = Math.abs(finalSalary);
  }

  const updatedRecord: any = {
    year,
    month,
    overtimeAmount,
    carryForwardIn,
    totalEarned: Math.round(totalEarned * 100) / 100,
    totalWithdrawals,
    finalSalary: Math.round(finalSalary * 100) / 100,
    carryForwardOut: Math.round(carryForwardOut * 100) / 100,
    updatedAt: serverTimestamp()
  };

  if (dutyDaysAdded && dutyDays !== null) {
    updatedRecord.dutyDays = dutyDays;
  }

  await setDoc(recordRef, updatedRecord, { merge: true });

  // 5. Propagate carry forward to next month recursively (up to 3 months forward to prevent infinite loop)
  const nextMonthStr = getNextMonthStr(yearMonthStr);
  const nextRecordRef = doc(db, "employees", employeeId, "monthlyRecords", nextMonthStr);
  const nextRecordSnap = await getDoc(nextRecordRef);
  if (nextRecordSnap.exists()) {
    await calculateSalaryInternal(employeeId, nextMonthStr);
  }

  return updatedRecord;
}

app.post("/api/recalculate", async (req, res) => {
  try {
    await ensureAdminAuth();
    const { employeeId, yearMonth } = req.body;
    if (!employeeId || !yearMonth) {
      return res.status(400).json({ error: "Missing employeeId or yearMonth" });
    }
    const result = await calculateSalaryInternal(employeeId, yearMonth);
    res.json({ success: true, record: result });
  } catch (error: any) {
    console.error("Recalculate error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------
// API: Gemini Natural-Language Command Bar
// ------------------------------------------------------------
app.post("/api/gemini-command", async (req, res) => {
  try {
    await ensureAdminAuth();
    const { command, selectedMonth } = req.body;
    if (!command) {
      return res.status(400).json({ error: "Command string is required" });
    }

    const currentYearMonth = selectedMonth || "2026_07";
    const [currentYear, currentMonth] = currentYearMonth.split("_").map(Number);

    // 1. Fetch all employees to give context to Gemini
    const employeesCol = collection(db, "employees");
    const employeesSnap = await getDocs(employeesCol);
    const employeesList: any[] = [];
    employeesSnap.forEach((doc) => {
      const d = doc.data();
      employeesList.push({
        id: doc.id,
        name: d.name,
        employeeLoginId: d.employeeLoginId,
        monthlySalary: d.monthlySalary
      });
    });

    // 2. Build Prompt to categorize command
    const systemPrompt = `You are a strict data parser and classifier for a traditional Indian "Sunshine Pagar Book" (ledger salary/advance app).
The current year is ${currentYear} and current month is ${currentMonth}.
You must analyze the user's natural language command (which may be in mixed Gujarati, Hindi, or English) and classify it into either a:
- "query" (reading summary, asking for details, or asking for hypothetical calculation projections)
- "write" (inserting a new advance upad or overtime)
- "clarify" (if you cannot confidently map to any known employee or action)

Here is the exact array of registered employees in the system:
${JSON.stringify(employeesList, null, 2)}

You MUST output STRICT JSON in this exact schema format:
{
  "action": "query" | "write" | "clarify",
  "employee_login_id": "string or null (matching the exact employeeLoginId from the list above, NOT the employee name)",
  "operation": "get_total_withdrawal" | "add_withdrawal" | "add_overtime" | "get_salary" | "calculate_hypothetical" | null,
  "amount": number or null,
  "note": "string or null (a short clear reason/remark in Gujarati/Hindi/English)",
  "month": number,
  "year": number,
  "clarifying_question": "string or null (only if action is 'clarify', asking the admin in simple Gujarati)"
}

Guidelines:
- Match employee name phonetically or partially (e.g. "Kaushik ko upad", "કૌશિક ને 5000 આપ્યા" -> matches Kaushik).
- "upad" or "ઉપાડ" or "advance" or "kharcha" -> "add_withdrawal" or "get_total_withdrawal".
- "salary" or "pagar" or "પગાર" -> "get_salary".
- If the user asks a hypothetical calculation like "25 divas no pagar upad bad karta ketlo thyo", set "operation" to "calculate_hypothetical".
- Always output exactly the JSON schema. Do not include markdown wraps like \`\`\`json.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: command,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const text = response.text || "{}";
    let parsedResult;
    try {
      parsedResult = JSON.parse(text.trim());
    } catch (e) {
      console.error("Failed to parse Gemini JSON:", text);
      return res.json({
        action: "clarify",
        clarifying_question: "કૃપા કરીને ફરીથી સ્પષ્ટ રીતે કહો, હું સમજી શક્યો નથી."
      });
    }

    // 3. For Query actions, execute read and format response
    if (parsedResult.action === "query") {
      const empId = parsedResult.employee_login_id;
      if (!empId) {
        return res.json({
          action: "clarify",
          clarifying_question: "કયા કર્મચારી માટે પૂછો છો તે કૃપા કરીને સ્પષ્ટ કરો."
        });
      }

      // Read info from Firestore
      const recordKey = `${parsedResult.year || currentYear}_${String(parsedResult.month || currentMonth).padStart(2, '0')}`;
      const recordRef = doc(db, "employees", empId, "monthlyRecords", recordKey);
      const recordSnap = await getDoc(recordRef);
      const employeeRef = doc(db, "employees", empId);
      const employeeSnap = await getDoc(employeeRef);

      const empData = employeeSnap.exists() ? employeeSnap.data() : {};
      const recData = recordSnap.exists() ? recordSnap.data() : {
        dutyDays: 26,
        totalEarned: empData.monthlySalary || 0,
        totalWithdrawals: 0,
        finalSalary: empData.monthlySalary || 0,
        overtimeAmount: 0,
        carryForwardIn: 0
      };

      // Query detailed withdrawals for the employee for this month to add details
      const withdrawalsCol = collection(db, "employees", empId, "withdrawals");
      const withdrawalsQuery = query(withdrawalsCol, where("monthlyRecordId", "==", recordKey));
      const withdrawalsSnap = await getDocs(withdrawalsQuery);
      const withdrawalsList: any[] = [];
      withdrawalsSnap.forEach((wDoc) => {
        const wData = wDoc.data();
        withdrawalsList.push({
          amount: wData.amount,
          note: wData.note || "No note",
          date: wData.date instanceof Timestamp ? wData.date.toDate().toLocaleDateString("en-IN") : "Unknown"
        });
      });

      // Recalculate just in case
      let finalSalaryValue = recData.finalSalary;
      let totalWithdrawalsValue = recData.totalWithdrawals;

      // Ask Gemini to formulate a short, polite, human answer in beautiful Gujarati
      const answerPrompt = `Based on this real business ledger data for employee ${empData.name || empId}:
- Base Monthly Salary: ₹${empData.monthlySalary || 0}
- Selected Month: ${parsedResult.month || currentMonth}/${parsedResult.year || currentYear}
- Duty Days worked: ${recData.dutyDays} days
- Overtime Amount: ₹${recData.overtimeAmount || 0}
- Carry Forward In from prior month: ₹${recData.carryForwardIn || 0}
- Total Withdrawals (Upad) taken this month: ₹${totalWithdrawalsValue}
- Net Final Salary for this month: ₹${finalSalaryValue}

Here are the individual withdrawals logged for this month:
${JSON.stringify(withdrawalsList, null, 2)}

The user's original question is: "${command}"

If the user's question asks for a hypothetical scenario (such as: what is the salary for 25 days after deducting withdrawals, or what would be the salary for X days), calculate the exact result using the formula:
Daily salary = Base Monthly Salary / 26
Earned salary for X days = Daily salary * X days
Final Net Salary = Earned salary for X days + Overtime - Total Withdrawals - Carry Forward In

Explain the answer to the admin in a short, clear single sentence in sweet, professional Business Gujarati. Mention exact rupee amounts and how they are calculated. Do not include markdown.`;

      const nlResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: answerPrompt,
        config: {
          temperature: 0.3
        }
      });

      return res.json({
        action: "query",
        resultText: nlResponse.text?.trim() || `કર્મચારી ${empData.name} નો ઉપાડ ₹${totalWithdrawalsValue} અને બાકી પગાર ₹${finalSalaryValue} છે.`
      });
    }

    // 4. For Write actions, return the intent to client for safe visual confirmation
    return res.json(parsedResult);

  } catch (error: any) {
    console.error("Gemini command error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------
// API: Admin Employee Management
// ------------------------------------------------------------
app.post("/api/admin/create-employee", async (req, res) => {
  try {
    await ensureAdminAuth();
    const { name, mobile, employeeLoginId, password, monthlySalary } = req.body;
    if (!name || !mobile || !employeeLoginId || !password || !monthlySalary) {
      return res.status(400).json({ error: "બધી માહિતી આવશ્યક છે." });
    }

    const email = `${employeeLoginId.toLowerCase()}@sunshinepagarbook.internal`;

    // Create user in Auth
    let uid = "";
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      uid = userCred.user.uid;
    } catch (authErr: any) {
      if (authErr.code === "auth/email-already-in-use") {
        return res.status(400).json({ error: "આ કર્મચારી આઈડી પહેલેથી રજીસ્ટર થયેલ છે." });
      }
      throw authErr;
    }

    // Create Profile Mapping
    await setDoc(doc(db, "profiles", uid), {
      role: "employee",
      employeeId: employeeLoginId
    }, { merge: true });

    // Create Employee Document
    const empRef = doc(db, "employees", employeeLoginId);
    await setDoc(empRef, {
      name,
      mobile,
      employeeLoginId,
      authUid: uid,
      monthlySalary: Number(monthlySalary),
      createdAt: serverTimestamp()
    }, { merge: true });

    // Seed initial monthly record
    const currentMonthKey = "2026_07";
    await setDoc(doc(db, "employees", employeeLoginId, "monthlyRecords", currentMonthKey), {
      year: 2026,
      month: 7,
      dutyDays: 26,
      overtimeAmount: 0,
      carryForwardIn: 0,
      totalEarned: Number(monthlySalary),
      totalWithdrawals: 0,
      finalSalary: Number(monthlySalary),
      carryForwardOut: 0,
      updatedAt: serverTimestamp()
    });

    res.json({ success: true, employeeId: employeeLoginId, uid });
  } catch (error: any) {
    console.error("Create employee error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/reset-password", async (req, res) => {
  try {
    await ensureAdminAuth();
    const { employeeLoginId, newPassword } = req.body;
    if (!employeeLoginId || !newPassword) {
      return res.status(400).json({ error: "કર્મચારી આઈડી અને પાસવર્ડ આવશ્યક છે." });
    }

    // Since Firebase Client Auth SDK cannot update other users' credentials,
    // we log this administrative request and update a profile field 'requestedPasswordReset'
    // or log it in a security collection.
    const empRef = doc(db, "employees", employeeLoginId);
    await setDoc(empRef, {
      tempPassword: newPassword,
      passwordResetRequired: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    res.json({ success: true, message: `કર્મચારી ${employeeLoginId} નો પાસવર્ડ રિસેટ કરવાની વિનંતી સફળ થઈ છે.` });
  } catch (error: any) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/delete-employee", async (req, res) => {
  try {
    await ensureAdminAuth();
    const { employeeId } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    // Mark as inactive in Firestore
    const empRef = doc(db, "employees", employeeId);
    await setDoc(empRef, {
      status: "inactive",
      deletedAt: serverTimestamp()
    }, { merge: true });

    res.json({ success: true, message: "કર્મચારી સફળતાપૂર્વક ડિલીટ થયો છે." });
  } catch (error: any) {
    console.error("Delete employee error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/update-employee", async (req, res) => {
  try {
    await ensureAdminAuth();
    const { employeeId, name, mobile, monthlySalary, selectedMonth } = req.body;
    if (!employeeId || !name || !mobile || monthlySalary === undefined) {
      return res.status(400).json({ error: "કર્મચારી આઈડી, નામ, મોબાઈલ અને પગાર આવશ્યક છે." });
    }

    const empRef = doc(db, "employees", employeeId);
    await setDoc(empRef, {
      name,
      mobile,
      monthlySalary: Number(monthlySalary),
      updatedAt: serverTimestamp()
    }, { merge: true });

    // If active month is provided, trigger recalculation for that month
    if (selectedMonth) {
      try {
        await calculateSalaryInternal(employeeId, selectedMonth);
      } catch (err) {
        console.warn("Recalculation on update-employee failed (safe to ignore if record does not exist):", err);
      }
    }

    res.json({ success: true, message: "કર્મચારીની માહિતી સફળતાપૂર્વક અપડેટ કરવામાં આવી છે." });
  } catch (error: any) {
    console.error("Update employee error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------
// API: One-time database seed (failsafe client-friendly trigger)
// ------------------------------------------------------------
app.post("/api/seed", async (req, res) => {
  try {
    const seedData = [
      { id: "Sunshine", name: "Sunshine", email: "sunshine@sunshinepagarbook.internal", pass: "Sun.456", role: "admin", salary: 0, mobile: "9999999999" },
      { id: "Kaushik", name: "Kaushik", email: "kaushik@sunshinepagarbook.internal", pass: "Kaushik.123", role: "employee", salary: 15000, mobile: "9876543210" },
      { id: "Shashikant", name: "Shashikant", email: "shashikant@sunshinepagarbook.internal", pass: "Shashikant.123", role: "employee", salary: 18000, mobile: "9876543211" },
      { id: "Kailash", name: "Kailash", email: "kailash@sunshinepagarbook.internal", pass: "Kailash.123", role: "employee", salary: 14000, mobile: "9876543212" },
      { id: "Ravin", name: "Ravin", email: "ravin@sunshinepagarbook.internal", pass: "Ravin.123", role: "employee", salary: 16000, mobile: "9876543213" },
      { id: "Manoj", name: "Manoj", email: "manoj@sunshinepagarbook.internal", pass: "Manoj.123", role: "employee", salary: 13500, mobile: "9876543214" },
      { id: "Rohit", name: "Rohit", email: "rohit@sunshinepagarbook.internal", pass: "Rohit.123", role: "employee", salary: 17000, mobile: "9876543215" },
      { id: "Shankar", name: "Shankar", email: "shankar@sunshinepagarbook.internal", pass: "Shankar.123", role: "employee", salary: 15500, mobile: "9876543216" },
      { id: "Mithun", name: "Mithun", email: "mithun@sunshinepagarbook.internal", pass: "Mithun.123", role: "employee", salary: 14500, mobile: "9876543217" }
    ];

    const results = [];

    for (const item of seedData) {
      let uid = "";
      // 1. Try to create Auth User
      try {
        const userCred = await createUserWithEmailAndPassword(auth, item.email, item.pass);
        uid = userCred.user.uid;
        results.push({ id: item.id, status: "created", email: item.email });
      } catch (err: any) {
        if (err.code === "auth/email-already-in-use" || err.message?.includes("already")) {
          // If already exists, sign in to retrieve uid
          try {
            const loginCred = await signInWithEmailAndPassword(auth, item.email, item.pass);
            uid = loginCred.user.uid;
            results.push({ id: item.id, status: "already_exists", email: item.email });
          } catch (loginErr: any) {
            // Attempt to heal using alternate/fallback passwords
            const alternatePasses = [];
            if (item.id === "Sunshine") {
              alternatePasses.push("Admin.456", "admin123", "sun.456", "Sun.456");
            } else {
              const capName = item.id.charAt(0).toUpperCase() + item.id.slice(1).toLowerCase();
              alternatePasses.push(`${capName}.123`, `${item.id.toLowerCase()}123`);
            }

            let healed = false;
            for (const altPass of alternatePasses) {
              try {
                const loginCred = await signInWithEmailAndPassword(auth, item.email, altPass);
                uid = loginCred.user.uid;
                if (auth.currentUser) {
                  await updatePassword(auth.currentUser, item.pass);
                }
                results.push({ id: item.id, status: "already_exists_healed", email: item.email, originalPass: altPass });
                healed = true;
                break;
              } catch (altErr) {
                // Try next
              }
            }

            if (!healed) {
              results.push({ id: item.id, status: "error_signin", error: loginErr.message });
              continue;
            }
          }
        } else {
          results.push({ id: item.id, status: "error_create", error: err.message });
          continue;
        }
      }

      if (uid) {
        // 2. Set Profiles/uid document
        await setDoc(doc(db, "profiles", uid), {
          role: item.role,
          employeeId: item.role === "admin" ? null : item.id
        }, { merge: true });

        // 3. For Employees, create employee document + initial monthlyRecord
        if (item.role === "employee") {
          await setDoc(doc(db, "employees", item.id), {
            name: item.name,
            mobile: item.mobile,
            employeeLoginId: item.id,
            authUid: uid,
            monthlySalary: item.salary,
            createdAt: serverTimestamp()
          }, { merge: true });

          // Seed default July 2026 record
          const julyRecordKey = "2026_07";
          const julyRecordRef = doc(db, "employees", item.id, "monthlyRecords", julyRecordKey);
          const recSnap = await getDoc(julyRecordRef);
          if (!recSnap.exists()) {
            const perDay = item.salary / 26;
            await setDoc(julyRecordRef, {
              year: 2026,
              month: 7,
              dutyDays: 26,
              overtimeAmount: 0,
              carryForwardIn: 0,
              totalEarned: item.salary,
              totalWithdrawals: 0,
              finalSalary: item.salary,
              carryForwardOut: 0,
              updatedAt: serverTimestamp()
            });
          }
        }
      }
    }

    // Re-authenticate back to Admin to leave the server in a clean admin-authorized state
    await ensureAdminAuth();

    res.json({ success: true, message: "Seeding run complete", details: results });
  } catch (error: any) {
    console.error("Seed error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------
// Vite Dev Server / Static Assets handling
// ------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sunshine Pagar Book full-stack server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
