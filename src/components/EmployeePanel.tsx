/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  collection, 
  doc, 
  getDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  updateDoc
} from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { Employee, MonthlyRecord, Withdrawal, AppNotification } from "../types";
import { Bell, LogOut, DollarSign, Calendar, TrendingUp, AlertTriangle, ListFilter, CreditCard } from "lucide-react";
import LedgerCard from "./LedgerCard";

interface EmployeePanelProps {
  employeeId: string;
  onLogout: () => void;
}

export default function EmployeePanel({ employeeId, onLogout }: EmployeePanelProps) {
  // States
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [records, setRecords] = useState<MonthlyRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  
  const [selectedMonth, setSelectedMonth] = useState<string>("2026_07");
  const [showUnreadNotifications, setShowUnreadNotifications] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1. Fetch employee master profile
  useEffect(() => {
    if (!employeeId) return;
    const path = `employees/${employeeId}`;
    const unsubscribe = onSnapshot(doc(db, "employees", employeeId), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setEmployee({
          id: snap.id,
          name: d.name,
          mobile: d.mobile,
          employeeLoginId: d.employeeLoginId,
          authUid: d.authUid,
          monthlySalary: d.monthlySalary || 0,
          createdAt: d.createdAt
        });
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [employeeId]);

  // 2. Fetch monthly records real-time
  useEffect(() => {
    if (!employeeId) return;
    const path = `employees/${employeeId}/monthlyRecords`;
    const unsubscribe = onSnapshot(collection(db, "employees", employeeId, "monthlyRecords"), (snap) => {
      const list: MonthlyRecord[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        list.push({
          id: doc.id,
          year: d.year,
          month: d.month,
          dutyDays: typeof d.dutyDays === 'number' ? d.dutyDays : 0,
          overtimeAmount: d.overtimeAmount ?? 0,
          carryForwardIn: d.carryForwardIn ?? 0,
          totalEarned: d.totalEarned ?? 0,
          totalWithdrawals: d.totalWithdrawals ?? 0,
          finalSalary: d.finalSalary ?? 0,
          carryForwardOut: d.carryForwardOut ?? 0,
          updatedAt: d.updatedAt
        });
      });
      // Sort records by year/month descending
      list.sort((a, b) => b.id.localeCompare(a.id));
      setRecords(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [employeeId]);

  // 3. Fetch withdrawals real-time
  useEffect(() => {
    if (!employeeId) return;
    const path = `employees/${employeeId}/withdrawals`;
    const unsubscribe = onSnapshot(collection(db, "employees", employeeId, "withdrawals"), (snap) => {
      const list: Withdrawal[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        list.push({
          id: doc.id,
          monthlyRecordId: d.monthlyRecordId,
          date: d.date,
          amount: d.amount || 0,
          note: d.note || "",
          createdBy: d.createdBy || "",
          createdAt: d.createdAt
        });
      });
      // Sort withdrawals newest first
      list.sort((a, b) => {
        const t1 = a.date?.seconds || 0;
        const t2 = b.date?.seconds || 0;
        return t2 - t1;
      });
      setWithdrawals(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [employeeId]);

  // 4. Fetch notifications for this employee real-time
  useEffect(() => {
    if (!employeeId) return;
    const path = `notifications`;
    const q = query(collection(db, "notifications"), where("employeeId", "==", employeeId));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: AppNotification[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        list.push({
          id: doc.id,
          employeeId: d.employeeId,
          type: d.type,
          title: d.title,
          message: d.message,
          amount: d.amount,
          isRead: d.isRead || false,
          createdAt: d.createdAt
        });
      });
      // Sort notifications newest first
      list.sort((a, b) => {
        const t1 = a.createdAt?.seconds || 0;
        const t2 = b.createdAt?.seconds || 0;
        return t2 - t1;
      });
      setNotifications(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [employeeId]);

  // Handle Mark single notification as read
  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), {
        isRead: true
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Filter values for the active selected month
  const currentRecord = records.find(r => r.id === selectedMonth) || null;
  const currentWithdrawals = withdrawals.filter(w => w.monthlyRecordId === selectedMonth);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Format month name in Hindi
  const getHindiMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split("_");
    const months = [
      "जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून",
      "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"
    ];
    return `${months[parseInt(month, 10) - 1]} ${year}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3EBD8] flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#8B2E2E] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-bold font-hindi-body text-gray-700">सनशाइन पगार बुक लोड हो रहा है...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3EBD8] text-ledger-ink font-sans pb-10">
      {/* Header Bar */}
      <header className="bg-[#8B2E2E] text-white py-4 px-4 shadow-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <div>
              <h1 className="text-lg font-bold font-hindi-title tracking-wide">सनशाइन पगार बुक</h1>
              <p className="text-[10px] text-red-200 uppercase font-mono tracking-wider">Employee Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Bell with Badge */}
            <div className="relative">
              <button 
                onClick={() => setShowUnreadNotifications(!showUnreadNotifications)}
                className="p-1.5 hover:bg-[#9C3B3B] rounded-full transition-colors relative"
              >
                <Bell className="w-5 h-5 text-white" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#A9772F] text-white text-[9px] font-bold font-mono h-4 w-4 rounded-full flex items-center justify-center border-2 border-[#8B2E2E] animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Logout Trigger */}
            <button 
              onClick={onLogout}
              className="p-1.5 hover:bg-[#9C3B3B] rounded-full transition-colors flex items-center gap-1 text-xs font-hindi-body"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">लॉगआउट</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 mt-6">
        
        {/* Welcome Profile Widget */}
        <div className="bg-[#FAF5EB] rounded border border-[#A9772F] p-4 mb-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-bold font-hindi-title text-gray-800">👤 नमस्ते, {employee?.name}!</h2>
            <p className="text-xs text-gray-500 font-mono">आईडी: {employee?.employeeLoginId} | मोबाइल: {employee?.mobile}</p>
          </div>
          <div className="bg-[#D4EFDF] border border-emerald-300 px-3 py-1.5 rounded flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#2F5D42]" />
            <span className="text-xs font-bold text-[#2F5D42] font-hindi-body">
              नियत वेतन: <span className="font-mono text-sm">₹{employee?.monthlySalary.toLocaleString('en-IN')}/माह</span>
            </span>
          </div>
        </div>

        {/* Real-time Notifications Drawer (Toggle) */}
        {showUnreadNotifications && (
          <div className="bg-[#FAF5EB] border-2 border-[#A9772F] rounded p-4 mb-6 animate-fade-in shadow-md">
            <div className="flex justify-between items-center border-b border-[#A9772F] pb-2 mb-3">
              <span className="text-sm font-bold text-gray-800 flex items-center gap-1 font-hindi-body">
                🔔 प्राप्त सूचनाएं ({notifications.length})
              </span>
              <button 
                onClick={() => setShowUnreadNotifications(false)}
                className="text-xs text-[#8B2E2E] hover:underline font-bold"
              >
                बंद करें
              </button>
            </div>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {notifications.length === 0 ? (
                <p className="text-xs text-center text-gray-500 py-3 font-hindi-body">कोई नई सूचना नहीं है।</p>
              ) : (
                notifications.map((n) => (
                  <div 
                    key={n.id} 
                    className={`p-2.5 rounded border text-xs flex justify-between items-start gap-3 transition-colors ${
                      n.isRead ? 'bg-[#FAF5EB] border-gray-200' : 'bg-red-50 border-red-300'
                    }`}
                  >
                    <div>
                      <h4 className="font-bold font-hindi-title text-gray-800">{n.title}</h4>
                      <p className="text-gray-600 font-hindi-body">{n.message}</p>
                    </div>
                    {!n.isRead && (
                      <button 
                        onClick={() => handleMarkAsRead(n.id)}
                        className="text-[10px] font-bold bg-[#8B2E2E] text-white px-2 py-0.5 rounded flex-shrink-0"
                      >
                        पढ़ा चिह्नित करें
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Month Selector for Pagar Ledger */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="text-sm font-bold font-hindi-title flex items-center gap-1.5 text-gray-700">
            <ListFilter className="w-4 h-4 text-[#A9772F]" />
            महीने का चयन करें:
          </span>
          <div className="flex gap-1.5 overflow-x-auto max-w-full py-1">
            {records.length === 0 ? (
              <span className="text-xs text-gray-500">कोई डेटा उपलब्ध नहीं</span>
            ) : (
              records.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedMonth(r.id)}
                  className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition-all border shrink-0 ${
                    selectedMonth === r.id
                      ? "bg-[#8B2E2E] text-white border-[#8B2E2E] shadow"
                      : "bg-[#FAF5EB] text-gray-700 border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {getHindiMonthName(r.id)}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Month Summary KPI Board */}
        {currentRecord && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
            
            {/* Duty Days */}
            <div className="bg-[#FAF5EB] p-3 rounded border border-[#A9772F] flex flex-col justify-between shadow-sm">
              <span className="text-[11px] text-gray-500 font-hindi-body flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#A9772F]" /> ड्यूटी के दिन
              </span>
              <span className="font-mono font-bold text-lg mt-1 text-gray-800">
                {currentRecord.dutyDays} दिन
              </span>
            </div>

            {/* Overtime */}
            <div className="bg-[#FAF5EB] p-3 rounded border border-[#A9772F] flex flex-col justify-between shadow-sm">
              <span className="text-[11px] text-gray-500 font-hindi-body flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#2F5D42]" /> ओवरटाइम राशि
              </span>
              <span className="font-mono font-bold text-lg mt-1 text-[#2F5D42]">
                ₹{currentRecord.overtimeAmount.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Total Withdrawals */}
            <div className="bg-[#FAF5EB] p-3 rounded border border-[#A9772F] flex flex-col justify-between shadow-sm">
              <span className="text-[11px] text-gray-500 font-hindi-body flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-[#8B2E2E]" /> कुल उपाड़
              </span>
              <span className="font-mono font-bold text-lg mt-1 text-[#8B2E2E]">
                -₹{currentRecord.totalWithdrawals.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Net Final Salary */}
            <div className="bg-amber-50 p-3 rounded border-2 border-[#A9772F] flex flex-col justify-between shadow-sm">
              <span className="text-[11px] text-gray-700 font-bold font-hindi-body">
                ⚖️ अंतिम सैलरी
              </span>
              <span className={`font-mono font-bold text-lg mt-1 ${currentRecord.finalSalary >= 0 ? "text-[#2F5D42]" : "text-[#8B2E2E]"}`}>
                ₹{currentRecord.finalSalary.toLocaleString('en-IN')}
              </span>
            </div>

          </div>
        )}

        {/* Main Signature Ledger Card Display */}
        <div id="ledger-card-capture">
          <LedgerCard
            record={currentRecord}
            withdrawals={currentWithdrawals}
            monthlySalary={employee?.monthlySalary || 0}
            language="hi"
          />
        </div>

        {/* History of other months summary list */}
        <div className="mt-8">
          <h3 className="text-md font-bold border-b border-[#A9772F] pb-1.5 mb-4 font-hindi-title flex items-center gap-1">
            📜 पिछला बहीखाता विवरण (All Months History)
          </h3>
          <div className="space-y-2.5">
            {records.map((r) => {
              if (r.id === selectedMonth) return null; // skip current
              return (
                <div 
                  key={r.id}
                  onClick={() => setSelectedMonth(r.id)}
                  className={`bg-[#FAF5EB] hover:bg-amber-50 cursor-pointer p-3.5 rounded border transition-all flex justify-between items-center text-xs ${
                    r.finalSalary >= 0 ? "border-[#A9772F]" : "border-[#8B2E2E]"
                  }`}
                >
                  <div className="space-y-1">
                    <span className="font-bold font-hindi-title text-sm">{getHindiMonthName(r.id)}</span>
                    <p className="text-gray-500 font-hindi-body">
                      ड्यूटी: {r.dutyDays} दिन | ओवरटाइम: ₹{r.overtimeAmount} | उपाड़: ₹{r.totalWithdrawals}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-gray-500 block uppercase font-mono">अंतिम राशि</span>
                    <span className={`font-mono font-bold text-sm ${r.finalSalary >= 0 ? "text-[#2F5D42]" : "text-[#8B2E2E]"}`}>
                      ₹{r.finalSalary.toLocaleString('en-IN')}
                    </span>
                    {r.finalSalary < 0 && (
                      <span className="text-[9px] font-bold text-[#8B2E2E] block font-hindi-body">घाटा आगे स्थानांतरित</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
