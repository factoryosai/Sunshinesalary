/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  serverTimestamp,
  getDocs,
  query,
  where,
  deleteDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Employee, MonthlyRecord, Withdrawal, AppNotification } from "../types";
import { 
  UserPlus, 
  Users, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Key, 
  Calculator, 
  TrendingUp, 
  Share2, 
  BellRing, 
  LogOut,
  Calendar,
  DollarSign,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  UserCog,
  Phone,
  Edit,
  X,
  Check,
  User,
  Sparkles,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Download
} from "lucide-react";
import LedgerCard from "./LedgerCard";
import GeminiCommandBar from "./GeminiCommandBar";
import AttendanceView from "./AttendanceView";
import WhatsAppShare from "./WhatsAppShare";

interface EmployeeManagementCardProps {
  emp: Employee;
  onUpdate: (empId: string, name: string, mobile: string, monthlySalary: number) => Promise<boolean>;
  onResetPassword: (empLoginId: string, newPass: string) => Promise<boolean>;
  onDelete: (empId: string) => Promise<void>;
  selectedMonth: string;
  adminUid: string;
  monthlyRecord?: MonthlyRecord;
  triggerRecalculate: (empId: string, monthKey: string) => Promise<void>;
  isSelected: boolean;
  onSelect: () => void;
  key?: string;
}

function EmployeeManagementCard({ 
  emp, 
  onUpdate, 
  onResetPassword, 
  onDelete,
  selectedMonth,
  adminUid,
  monthlyRecord,
  triggerRecalculate,
  isSelected,
  onSelect
}: EmployeeManagementCardProps) {
  // Core states
  const [cardTab, setCardTab] = useState<"stats" | "upad" | "pagar" | "gemini" | "manage">("stats");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localSuccess, setLocalSuccess] = useState("");
  const [localError, setLocalError] = useState("");

  // States for Editing/Deleting Withdrawals
  const [editingWithdrawalId, setEditingWithdrawalId] = useState<string | null>(null);
  const [editWithdrawalAmount, setEditWithdrawalAmount] = useState<string>("");
  const [editWithdrawalNote, setEditWithdrawalNote] = useState<string>("");

  // Sub-listeners for this specific employee's histories (loaded on demand when dashboard is expanded)
  const isDashboardExpanded = isSelected;
  const [cardWithdrawals, setCardWithdrawals] = useState<Withdrawal[]>([]);
  const [cardRecords, setCardRecords] = useState<MonthlyRecord[]>([]);
  const [cardNotifications, setCardNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!isDashboardExpanded) return;

    // 1. Fetch employee's withdrawals
    const unsubscribeWithdrawals = onSnapshot(
      collection(db, "employees", emp.id, "withdrawals"),
      (snap) => {
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
        list.sort((a, b) => {
          const t1 = a.date?.seconds || 0;
          const t2 = b.date?.seconds || 0;
          return t2 - t1;
        });
        setCardWithdrawals(list);
      },
      (err) => console.error("Error loading withdrawals for card:", err)
    );

    // 2. Fetch employee's monthly records
    const unsubscribeRecords = onSnapshot(
      collection(db, "employees", emp.id, "monthlyRecords"),
      (snap) => {
        const list: MonthlyRecord[] = [];
        snap.forEach((doc) => {
          const d = doc.data();
          list.push({
            id: doc.id,
            year: d.year,
            month: d.month,
            dutyDays: typeof d.dutyDays === 'number' ? d.dutyDays : undefined,
            overtimeAmount: d.overtimeAmount ?? 0,
            carryForwardIn: d.carryForwardIn ?? 0,
            totalEarned: d.totalEarned ?? 0,
            totalWithdrawals: d.totalWithdrawals ?? 0,
            finalSalary: d.finalSalary ?? 0,
            carryForwardOut: d.carryForwardOut ?? 0,
            updatedAt: d.updatedAt
          });
        });
        list.sort((a, b) => b.id.localeCompare(a.id));
        setCardRecords(list);
      },
      (err) => console.error("Error loading monthly records for card:", err)
    );

    // 3. Fetch employee's notifications
    const unsubscribeNotifications = onSnapshot(
      query(collection(db, "notifications"), where("employeeId", "==", emp.id)),
      (snap) => {
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
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setCardNotifications(list);
      },
      (err) => console.error("Error loading notifications for card:", err)
    );

    return () => {
      unsubscribeWithdrawals();
      unsubscribeRecords();
      unsubscribeNotifications();
    };
  }, [isDashboardExpanded, emp.id]);

  // Tab: Upad state
  const [upadAmount, setUpadAmount] = useState<string>("");
  const [upadNote, setUpadNote] = useState<string>("ઉપાડ");

  // Tab: Pagar state
  const [pagarDays, setPagarDays] = useState<number>(0);
  const [pagarOvertime, setPagarOvertime] = useState<number>(0);

  // Tab: Gemini state
  const [geminiPrompt, setGeminiPrompt] = useState("");
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiResponse, setGeminiResponse] = useState<string | null>(null);

  // Tab: Edit info state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(emp.name);
  const [editMobile, setEditMobile] = useState(emp.mobile);
  const [editSalary, setEditSalary] = useState(emp.monthlySalary);

  // Tab: Reset Password state
  const [isResettingPass, setIsResettingPass] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Tab: Delete state
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Sync state values when monthlyRecord changes (only once when selection changes)
  const [loadedMonthKey, setLoadedMonthKey] = useState<string>("");
  useEffect(() => {
    const currentKey = `${emp.id}_${selectedMonth}`;
    if (monthlyRecord && loadedMonthKey !== currentKey) {
      setPagarDays(monthlyRecord.dutyDays ?? 0);
      setPagarOvertime(monthlyRecord.overtimeAmount ?? 0);
      setLoadedMonthKey(currentKey);
    } else if (!monthlyRecord && loadedMonthKey !== currentKey) {
      setPagarDays(0);
      setPagarOvertime(0);
      setLoadedMonthKey(currentKey);
    }
  }, [monthlyRecord, selectedMonth, emp.id, loadedMonthKey]);

  // Actions
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLocalError("");
    setLocalSuccess("");
    const success = await onUpdate(emp.id, editName, editMobile, editSalary);
    setIsSubmitting(false);
    if (success) {
      setIsEditing(false);
      setLocalSuccess("કર્મચારીની માહિતી સફળતાપૂર્વક સુધારાઈ!");
      setTimeout(() => setLocalSuccess(""), 4000);
    } else {
      setLocalError("કર્મચારીની માહિતી સુધારવામાં ભૂલ આવી.");
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;
    setIsSubmitting(true);
    setLocalError("");
    setLocalSuccess("");
    const success = await onResetPassword(emp.id, newPassword);
    setIsSubmitting(false);
    if (success) {
      setNewPassword("");
      setIsResettingPass(false);
      setLocalSuccess("પાસવર્ડ રિસેટ વિનંતી સફળ રહી!");
      setTimeout(() => setLocalSuccess(""), 4000);
    } else {
      setLocalError("પાસવર્ડ બદલવામાં ભૂલ આવી.");
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await onDelete(emp.id);
      setIsConfirmingDelete(false);
    } catch (err) {
      setLocalError("કર્મચારી કાઢી નાખવામાં ભૂલ આવી.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add Upad Entry directly inside the card
  const handleAddUpadDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(upadAmount);
    if (!amt || amt <= 0) {
      setLocalError("કૃપા કરીને યોગ્ય રકમ દાખલ કરો.");
      return;
    }

    setIsSubmitting(true);
    setLocalError("");
    setLocalSuccess("");
    try {
      // 1. Write withdrawal (Upad) to Firestore
      const withdrawalsCol = collection(db, "employees", emp.id, "withdrawals");
      await addDoc(withdrawalsCol, {
        monthlyRecordId: selectedMonth,
        date: serverTimestamp(),
        amount: amt,
        note: upadNote || "ઉપાડ",
        createdBy: adminUid,
        createdAt: serverTimestamp()
      });

      // 2. Write notification
      await addDoc(collection(db, "notifications"), {
        employeeId: emp.id,
        type: "upad",
        title: "નવો ઉપાડ મળ્યો 💸",
        message: `તમને આ મહિનામાં ₹${amt} નો ઉપાડ મળ્યો છે. નોંધ: ${upadNote || "ઉપાડ"}`,
        amount: amt,
        isRead: false,
        createdAt: serverTimestamp()
      });

      // 3. Trigger server recalculate
      await triggerRecalculate(emp.id, selectedMonth);

      setUpadAmount("");
      setUpadNote("ઉપાડ");
      setLocalSuccess(`₹${amt} નો ઉપાડ સફળતાપૂર્વક ઉમેરાયો!`);
      setCardTab("stats");
      setTimeout(() => setLocalSuccess(""), 4000);
    } catch (err: any) {
      console.error(err);
      setLocalError("ઉપાડ ઉમેરવામાં નિષ્ફળતા મળી.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWithdrawal = async (wId: string, monthKey: string) => {
    if (!window.confirm("શું તમે આ ઉપાડ ખરેખર ડિલીટ કરવા માંગો છો?")) return;
    try {
      setIsSubmitting(true);
      setLocalError("");
      const docRef = doc(db, "employees", emp.id, "withdrawals", wId);
      await deleteDoc(docRef);
      await triggerRecalculate(emp.id, monthKey);
      setLocalSuccess("ઉપાડ સફળતાપૂર્વક કાઢી નાખવામાં આવ્યો છે!");
      setTimeout(() => setLocalSuccess(""), 4000);
    } catch (err: any) {
      console.error(err);
      setLocalError("ઉપાડ ડિલીટ કરવામાં ભૂલ આવી.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditWithdrawal = (w: Withdrawal) => {
    setEditingWithdrawalId(w.id);
    setEditWithdrawalAmount(String(w.amount));
    setEditWithdrawalNote(w.note || "");
  };

  const handleSaveEditWithdrawal = async (wId: string, monthKey: string) => {
    const amt = Number(editWithdrawalAmount);
    if (!amt || amt <= 0) {
      alert("કૃપા કરીને યોગ્ય રકમ દાખલ કરો.");
      return;
    }
    try {
      setIsSubmitting(true);
      setLocalError("");
      const docRef = doc(db, "employees", emp.id, "withdrawals", wId);
      await setDoc(docRef, {
        amount: amt,
        note: editWithdrawalNote,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await triggerRecalculate(emp.id, monthKey);
      setEditingWithdrawalId(null);
      setLocalSuccess("ઉપાડ સફળતાપૂર્વક અપડેટ થયો છે!");
      setTimeout(() => setLocalSuccess(""), 4000);
    } catch (err: any) {
      console.error(err);
      setLocalError("ઉપાડ અપડેટ કરવામાં ભૂલ આવી.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add Pagar stats update directly inside the card
  const handleUpdatePagarDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLocalError("");
    setLocalSuccess("");
    try {
      const recordRef = doc(db, "employees", emp.id, "monthlyRecords", selectedMonth);
      const [year, month] = selectedMonth.split("_").map(Number);

      await setDoc(recordRef, {
        year,
        month,
        dutyDays: Number(pagarDays),
        overtimeAmount: Number(pagarOvertime),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Send real-time notification
      await addDoc(collection(db, "notifications"), {
        employeeId: emp.id,
        type: "pagar",
        title: "પગાર અપડેટ થયો 💸",
        message: `એડમિન દ્વારા હાજરી દિવસો: ${pagarDays} અને ઓવરટાઇમ: ₹${pagarOvertime} સેટ કરેલ છે.`,
        isRead: false,
        createdAt: serverTimestamp()
      });

      // Trigger recalculate
      await triggerRecalculate(emp.id, selectedMonth);

      setLocalSuccess("હાજરી દિવસો અને ઓવરટાઇમ અપડેટ થયા!");
      setCardTab("stats");
      setTimeout(() => setLocalSuccess(""), 4000);
    } catch (err) {
      console.error(err);
      setLocalError("પગાર પત્રક અપડેટ કરવામાં નિષ્ફળતા મળી.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInlineSaveDutyDays = async () => {
    setIsSubmitting(true);
    setLocalError("");
    setLocalSuccess("");
    try {
      const recordRef = doc(db, "employees", emp.id, "monthlyRecords", selectedMonth);
      const [year, month] = selectedMonth.split("_").map(Number);

      await setDoc(recordRef, {
        year,
        month,
        dutyDays: Number(pagarDays),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Send real-time notification
      await addDoc(collection(db, "notifications"), {
        employeeId: emp.id,
        type: "pagar",
        title: "હાજરી અપડેટ થઈ 📅",
        message: `એડમિન દ્વારા હાજરી દિવસો: ${pagarDays} સેટ કરેલ છે.`,
        isRead: false,
        createdAt: serverTimestamp()
      });

      // Trigger recalculate
      await triggerRecalculate(emp.id, selectedMonth);

      setLocalSuccess("હાજરી દિવસો અપડેટ થયા!");
      setTimeout(() => setLocalSuccess(""), 4000);
    } catch (err) {
      console.error(err);
      setLocalError("હાજરી સેવ કરવામાં ભૂલ આવી.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ask Gemini with pre-constructed prompt for this employee context
  const handleAskGemini = async (commandText: string) => {
    if (!commandText.trim()) return;
    setGeminiLoading(true);
    setLocalError("");
    setGeminiResponse(null);
    try {
      const response = await fetch("/api/gemini-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `${emp.name} (${emp.id}): ${commandText}`,
          selectedMonth: selectedMonth
        })
      });

      if (!response.ok) {
        throw new Error("સર્વર પ્રતિસાદ આપવામાં અસમર્થ છે.");
      }

      const data = await response.json();
      if (data.action === "query") {
        setGeminiResponse(data.resultText);
      } else if (data.action === "clarify") {
        setGeminiResponse(data.clarifying_question);
      } else if (data.action === "write") {
        setGeminiResponse(`શાહી જીની કમાન્ડ મળ્યો: ${data.operation === "add_withdrawal" ? "ઉપાડ" : "ઓવરટાઇમ"} ₹${data.amount}. કૃપા કરીને ખાતામાં ડેટા સેવ કરવા માટે મુખ્ય 'શાહી અવાજ કમાન્ડર' અથવા આ કાર્ડની અંદરના પર્ટીક્યુલર ફોર્મનો ઉપયોગ કરો.`);
      }
    } catch (err: any) {
      console.error(err);
      setLocalError("જીની પ્રોસેસ કરવામાં કોઈ ભૂલ આવી. કૃપા કરીને ફરી પ્રયાસ કરો.");
    } finally {
      setGeminiLoading(false);
    }
  };

  // Human-friendly Month string
  const formatMonthName = (monthKey: string) => {
    const parts = monthKey.split("_");
    if (parts.length < 2) return monthKey;
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    const monthsGuj = ["", "જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઓગસ્ટ", "સપ્ટેમ્બર", "ઓક્ટોબર", "નવેમ્બર", "ડિસેમ્બર"];
    return `${monthsGuj[month] || month} ${year}`;
  };

  const initials = emp.name ? emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "E";

  // Calculation parameters
  const baseSalary = emp.monthlySalary || 0;
  
  // Check if duty days have been explicitly added
  const hasDutyDays = monthlyRecord && typeof monthlyRecord.dutyDays === 'number';

  const dutyDaysValue = hasDutyDays ? `${monthlyRecord.dutyDays} દિવસ` : "0 દિવસ";
  const earnedValue = hasDutyDays ? (monthlyRecord.totalEarned ?? 0) : 0;
  const overtimeVal = hasDutyDays ? (monthlyRecord.overtimeAmount ?? 0) : 0;
  const carryIn = monthlyRecord ? (monthlyRecord.carryForwardIn ?? 0) : 0;
  const totalWithdrawalVal = monthlyRecord ? (monthlyRecord.totalWithdrawals ?? 0) : 0;
  
  const finalSalaryVal = hasDutyDays 
    ? (monthlyRecord.finalSalary ?? 0) 
    : -(totalWithdrawalVal + carryIn);

  const carryOut = hasDutyDays 
    ? (monthlyRecord.carryForwardOut ?? 0) 
    : (totalWithdrawalVal + carryIn);

  return (
    <div 
      className={`rounded-xl text-ledger-ink transition-all duration-300 overflow-hidden flex flex-col justify-between border-2 ${
        isSelected 
          ? "bg-[#FCFAF5] border-[#8B2E2E] shadow-lg ring-2 ring-[#8B2E2E]/10" 
          : "bg-white border-gray-200 hover:border-[#A9772F]/60 shadow-xs hover:shadow-md"
      }`}
    >
      
      {/* 1. Header Card Badge */}
      <div 
        onClick={() => onSelect()}
        className={`p-4 border-b cursor-pointer transition-colors duration-300 ${
          isSelected 
            ? "bg-gradient-to-r from-[#8B2E2E]/8 to-[#A9772F]/4 border-[#8B2E2E]/20 hover:bg-[#8B2E2E]/10" 
            : "bg-gray-50/50 border-gray-100 hover:bg-gray-100/70"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar Circle */}
            <div className={`w-11 h-11 rounded-full text-amber-50 flex items-center justify-center font-bold text-sm shadow-xs border shrink-0 transition-all ${
              isSelected 
                ? "bg-gradient-to-br from-[#8B2E2E] to-[#A9772F] border-amber-200 scale-105 ring-2 ring-[#8B2E2E]/20" 
                : "bg-gray-400 text-white border-white"
            }`}>
              {initials}
            </div>
            <div className="min-w-0">
              <h4 className="font-extrabold text-[14px] text-gray-900 truncate font-guj-title leading-tight flex items-center gap-1.5" title={emp.name}>
                {emp.name}
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-[#8B2E2E] animate-ping shrink-0" />
                )}
              </h4>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                <span className={`font-mono px-1.5 py-0.5 rounded font-extrabold shrink-0 ${
                  isSelected ? "bg-amber-100 text-[#A9772F]" : "bg-gray-100 text-gray-500"
                }`}>
                  ID: {emp.id}
                </span>
                <span className="text-gray-500 font-mono flex items-center gap-0.5 shrink-0">
                  <Phone className="w-2.5 h-2.5 text-gray-400" /> {emp.mobile}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0 flex flex-col items-end gap-1">
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold font-guj-body border ${
              isSelected
                ? "bg-[#8B2E2E]/10 text-[#8B2E2E] border-[#8B2E2E]/20"
                : "bg-gray-100 text-gray-600 border-gray-200"
            }`}>
              {formatMonthName(selectedMonth)}
            </span>
            {hasDutyDays ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> હાજરી ગણેલ
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> હાજરી બાકી છે
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Error or Success feedback within Card */}
      {localSuccess && (
        <div className="mx-4 mt-2.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 rounded text-[11px] text-emerald-800 font-guj-body animate-fade-in flex items-center gap-1">
          <Check className="w-3.5 h-3.5 shrink-0 stroke-[3px]" />
          <span>{localSuccess}</span>
        </div>
      )}
      {localError && (
        <div className="mx-4 mt-2.5 px-3 py-1.5 bg-red-50 border border-red-300 rounded text-[11px] text-[#8B2E2E] font-guj-body flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{localError}</span>
        </div>
      )}

      {/* 3. Main Content Container based on Tabs (rendered only if selected, else show compact summary) */}
      {!isSelected ? (
        <div 
          onClick={() => onSelect()}
          className="p-4 space-y-3 flex-1 flex flex-col justify-between cursor-pointer hover:bg-amber-50/10"
        >
          <div className="grid grid-cols-2 gap-2 text-[10px] font-guj-body text-gray-600">
            <div className="bg-gray-50 p-2 rounded border border-gray-150">
              <span className="text-gray-400 block uppercase font-bold text-[9px]">નિયત માસિક વેતન</span>
              <span className="font-extrabold font-mono text-gray-700">₹{baseSalary.toLocaleString()}</span>
            </div>
            <div className="bg-gray-50 p-2 rounded border border-gray-150">
              <span className="text-gray-400 block uppercase font-bold text-[9px]">હાજરી (Duty Days)</span>
              <span className={`font-extrabold font-mono ${hasDutyDays ? "text-emerald-700" : "text-amber-600"}`}>
                {dutyDaysValue}
              </span>
            </div>
            <div className="bg-gray-50 p-2 rounded border border-gray-150">
              <span className="text-gray-400 block uppercase font-bold text-[9px]">કમાણી + ઓવરટાઈમ</span>
              <span className="font-extrabold font-mono text-gray-700">₹{Math.round(earnedValue + overtimeVal).toLocaleString()}</span>
            </div>
            <div className="bg-gray-50 p-2 rounded border border-gray-150">
              <span className="text-gray-400 block uppercase font-bold text-[9px] text-red-500">કુલ ઉપાડ</span>
              <span className="font-extrabold font-mono text-red-600">-₹{totalWithdrawalVal.toLocaleString()}</span>
            </div>
          </div>

          <div className={`p-2 rounded border flex items-center justify-between ${
            finalSalaryVal >= 0 
              ? 'bg-emerald-50/50 border-emerald-300/40 text-[#2F5D42]' 
              : 'bg-red-50/50 border-red-300/40 text-[#8B2E2E]'
          }`}>
            <span className="text-[9px] uppercase font-extrabold font-guj-body">
              {finalSalaryVal >= 0 ? "ચૂકવવાપાત્ર ચોખ્ખો પગાર" : "ઉપાડ બાકી છે (Overdrawn)"}
            </span>
            <span className="text-xs font-extrabold font-mono">
              ₹{Math.round(finalSalaryVal).toLocaleString()}
            </span>
          </div>

          <div className="bg-amber-50/40 hover:bg-amber-50/70 p-2 text-center text-[10px] font-bold text-[#A9772F] font-guj-body rounded-lg border border-dashed border-[#A9772F]/30 transition-colors">
            📂 સંપૂર્ણ હિસાબ, ઉપાડ, હાજરી અને AI જીની ખોલવા ક્લિક કરો
          </div>
        </div>
      ) : (
        <div className="p-4 flex-1">
          {/* TABS: DETAILS & STATS */}
          {cardTab === "stats" && (
            <div className="space-y-3 animate-fade-in">
              {/* Elegant Ledger Grid */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-guj-body text-gray-700">
                <div className="bg-white p-2 rounded border border-gray-200">
                  <span className="text-[10px] text-gray-400 block uppercase font-bold">નિયત માસિક વેતન</span>
                  <span className="font-bold font-mono text-gray-800">₹{baseSalary.toLocaleString()}</span>
                </div>
                <div className="bg-white p-2 rounded border border-gray-200 flex flex-col justify-between">
                  <span className="text-[10px] text-gray-400 block uppercase font-bold">હાજરી (Duty Days)</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="31"
                      placeholder="0"
                      value={pagarDays === 0 && !hasDutyDays ? "" : pagarDays}
                      onChange={(e) => setPagarDays(e.target.value === "" ? 0 : Number(e.target.value))}
                      className="w-12 px-1 py-0.5 bg-gray-50 rounded border border-gray-300 text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-[#2F5D42]"
                    />
                    <button
                      type="button"
                      onClick={handleInlineSaveDutyDays}
                      disabled={isSubmitting}
                      className="bg-[#2F5D42] hover:bg-[#1e3c2b] text-white px-2 py-0.5 rounded text-[10px] font-bold transition-all shrink-0 active:scale-95"
                    >
                      સેવ
                    </button>
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-gray-200">
                  <span className="text-[10px] text-gray-400 block uppercase font-bold">કમાયેલ વેતન + ઓવરટાઈમ</span>
                  <span className="font-bold font-mono text-gray-800">₹{Math.round(earnedValue + overtimeVal).toLocaleString()}</span>
                </div>
                <div className="bg-white p-2 rounded border border-gray-200">
                  <span className="text-[10px] text-gray-400 block uppercase font-bold text-red-500">કુલ ઉપાડ (Upad Taken)</span>
                  <span className="font-bold font-mono text-red-600">-₹{totalWithdrawalVal.toLocaleString()}</span>
                </div>
              </div>

              {/* Carry forwards if any */}
              {(carryIn > 0 || carryOut > 0) && (
                <div className="bg-amber-50/50 p-2 rounded border border-dashed border-[#A9772F]/40 text-[10px] text-[#A9772F] font-mono flex justify-between">
                  {carryIn > 0 && <span>• ગયા મહિનાનો બાકી ઉપાડ: ₹{Math.round(carryIn)}</span>}
                  {carryOut > 0 && <span>• આગામી મહિનાનો બાકી ઉપાડ: ₹{Math.round(carryOut)}</span>}
                </div>
              )}

              {/* Final Pay Box Badge */}
              <div className={`p-2.5 rounded border-2 flex flex-col gap-1 shadow-sm ${
                finalSalaryVal >= 0 
                  ? 'bg-emerald-50 border-emerald-500/40 text-[#2F5D42]' 
                  : 'bg-red-50 border-red-500/40 text-[#8B2E2E]'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold font-guj-body block leading-tight">
                      {finalSalaryVal >= 0 ? "ચૂકવવાપાત્ર ચોખ્ખો પગાર" : "ઉપાડ બાકી છે"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-md font-extrabold font-mono leading-none">
                      ₹{Math.round(finalSalaryVal).toLocaleString()}
                    </span>
                  </div>
                </div>
                {!hasDutyDays && (
                  <div className="text-[9px] text-[#8B2E2E]/85 border-t border-[#8B2E2E]/25 pt-1.5 mt-0.5 leading-normal">
                    * હાજરી ગણવાની બાકી હોવાથી સેલેરી ₹૦ છે. માત્ર પિછલા મહિનાનો બાકી ઉપાડ અને ચાલુ મહિનાના એડવાન્સની ગણતરી કરેલ છે.
                  </div>
                )}
              </div>
            </div>
          )}

        {/* TABS: ADD UPAD DIRECT FORM */}
        {cardTab === "upad" && (
          <form onSubmit={handleAddUpadDirect} className="space-y-3 animate-fade-in font-guj-body">
            <h5 className="text-xs font-bold text-[#8B2E2E] border-b border-red-100 pb-1 flex items-center gap-1">
              💸 રોકડો ઉપાડ આપો (Advance Payment)
            </h5>
            
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-5">
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">રૂપિયા (Amount)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    value={upadAmount}
                    onChange={(e) => setUpadAmount(e.target.value)}
                    placeholder="દા.ત. 2000"
                    required
                    className="w-full pl-6 pr-2 py-1.5 bg-white rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B2E2E] font-mono font-bold"
                  />
                </div>
              </div>

              <div className="col-span-7">
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">વિગત / નોંધ (Description)</label>
                <input
                  type="text"
                  value={upadNote}
                  onChange={(e) => setUpadNote(e.target.value)}
                  placeholder="નોંધ (દા.ત. એડવાન્સ ખર્ચો)"
                  className="w-full px-2.5 py-1.5 bg-white rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B2E2E]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-[#8B2E2E] hover:bg-[#6c2222] text-white py-1.5 rounded text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" /> સેવ કરો (+ Upad)
              </button>
              <button
                type="button"
                onClick={() => { setCardTab("stats"); setUpadAmount(""); }}
                className="px-3 bg-gray-200 hover:bg-gray-300 text-gray-700 py-1.5 rounded text-xs font-bold transition-all"
              >
                રદ કરો
              </button>
            </div>
          </form>
        )}

        {/* TABS: ADD PAGAR STATS UPDATE FORM */}
        {cardTab === "pagar" && (
          <form onSubmit={handleUpdatePagarDirect} className="space-y-3 animate-fade-in font-guj-body">
            <h5 className="text-xs font-bold text-[#2F5D42] border-b border-emerald-100 pb-1 flex items-center gap-1">
              📅 હાજરી અને ઓવરટાઈમ સેટિંગ્સ
            </h5>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">ડ્યુટી હાજરી દિવસો</label>
                <input
                  type="number"
                  min="0"
                  max="31"
                  value={pagarDays}
                  onChange={(e) => setPagarDays(Number(e.target.value))}
                  required
                  className="w-full px-2.5 py-1.5 bg-white rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#2F5D42] font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">ઓવરટાઈમ ભથ્થું (Overtime ₹)</label>
                <input
                  type="number"
                  value={pagarOvertime}
                  onChange={(e) => setPagarOvertime(Number(e.target.value))}
                  required
                  className="w-full px-2.5 py-1.5 bg-white rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#2F5D42] font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-[#2F5D42] hover:bg-[#1e3c2b] text-white py-1.5 rounded text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" /> અપડેટ કરો
              </button>
              <button
                type="button"
                onClick={() => setCardTab("stats")}
                className="px-3 bg-gray-200 hover:bg-gray-300 text-gray-700 py-1.5 rounded text-xs font-bold transition-all"
              >
                રદ કરો
              </button>
            </div>
          </form>
        )}

        {/* TABS: ASK GEMINI BLOCK */}
        {cardTab === "gemini" && (
          <div className="space-y-3 animate-fade-in font-guj-body text-xs">
            <h5 className="text-xs font-bold text-[#A9772F] border-b border-amber-100 pb-1 flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" /> શાહી જીની સહાયક (Gemini AI assistant)
            </h5>

            {/* Quick action buttons */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleAskGemini("કાગળ પત્રક અને પગાર બ્રેકડાઉન ગણતરી સમજાવો")}
                className="bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-1 rounded text-[10px] font-bold text-amber-800 transition-all flex items-center gap-1"
                disabled={geminiLoading}
              >
                ⚡ વેતન બ્રેકડાઉન પૂછો
              </button>
              <button
                type="button"
                onClick={() => handleAskGemini("કુલ કેટલો ઉપાડ લીધો છે અને ઉપાડ હિસ્ટ્રી વિશ્લેષણ કરો")}
                className="bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-1 rounded text-[10px] font-bold text-amber-800 transition-all flex items-center gap-1"
                disabled={geminiLoading}
              >
                🔍 ઉપાડ ઓડિટ
              </button>
            </div>

            {/* Manual input prompt */}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={geminiPrompt}
                onChange={(e) => setGeminiPrompt(e.target.value)}
                placeholder="દા.ત. હાજરી દિવસો ઓછા કેમ છે?"
                className="flex-1 px-2.5 py-1.5 bg-white rounded border border-[#A9772F]/50 text-xs focus:outline-none"
                disabled={geminiLoading}
              />
              <button
                type="button"
                onClick={() => { handleAskGemini(geminiPrompt); setGeminiPrompt(""); }}
                disabled={geminiLoading || !geminiPrompt.trim()}
                className="bg-[#A9772F] hover:bg-[#8f6222] text-white px-2.5 rounded text-xs font-bold"
              >
                પૂછો
              </button>
            </div>

            {/* Gemini loading state */}
            {geminiLoading && (
              <div className="p-3 bg-amber-50/50 rounded border border-dashed border-amber-200 text-center animate-pulse text-amber-800 text-[11px] font-bold flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                જીની વિચારી રહી છે અને હિસાબ ચેક કરે છે...
              </div>
            )}

            {/* Gemini Response Block */}
            {geminiResponse && (
              <div className="p-2.5 bg-amber-50 border-l-4 border-amber-500 rounded-r text-[11px] leading-relaxed max-h-[140px] overflow-y-auto font-medium text-gray-800">
                <div className="font-bold text-[#A9772F] mb-1 text-[9px] uppercase tracking-wider">જીની નો જવાબ:</div>
                <p className="whitespace-pre-line">{geminiResponse}</p>
              </div>
            )}
          </div>
        )}

        {/* TABS: PRIMARY MANAGEMENT */}
        {cardTab === "manage" && (
          <div className="space-y-3 animate-fade-in">
            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="space-y-3 font-guj-body text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-0.5">કર્મચારીનું નામ (Name)</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 bg-white rounded border border-gray-300 text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-0.5">મોબાઈલ નંબર (Mobile)</label>
                  <input
                    type="text"
                    value={editMobile}
                    onChange={(e) => setEditMobile(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 bg-white rounded border border-gray-300 text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-0.5">માસિક નિયત પગાર (Wages)</label>
                  <input
                    type="number"
                    value={editSalary}
                    onChange={(e) => setEditSalary(Number(e.target.value))}
                    required
                    className="w-full px-2.5 py-1.5 bg-white rounded border border-gray-300 text-xs focus:outline-none font-mono font-bold"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-[#2F5D42] hover:bg-[#1f3e2b] text-white py-1.5 rounded text-xs font-bold transition-all flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> સાચવો (Save)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsEditing(false); setEditName(emp.name); setEditMobile(emp.mobile); setEditSalary(emp.monthlySalary); }}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-1.5 rounded text-xs font-bold transition-all"
                  >
                    રદ કરો
                  </button>
                </div>
              </form>
            ) : isResettingPass ? (
              <form onSubmit={handleSavePassword} className="space-y-3 font-guj-body text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-0.5">નવો પાસવર્ડ (New Password)</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="દા.ત. NewPassword123"
                    required
                    className="w-full px-2.5 py-1.5 bg-white rounded border border-gray-300 text-xs focus:outline-none font-mono"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-[#A9772F] hover:bg-[#8e6122] text-white py-1.5 rounded text-xs font-bold transition-all flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> સેટ કરો (Set)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsResettingPass(false); setNewPassword(""); }}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-1.5 rounded text-xs font-bold transition-all"
                  >
                    રદ કરો
                  </button>
                </div>
              </form>
            ) : isConfirmingDelete ? (
              <div className="space-y-2.5 font-guj-body text-xs text-center py-1">
                <div className="text-[#8B2E2E] font-bold text-xs flex items-center justify-center gap-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> આ કર્મચારીને કાઢી નાખવો છે?
                </div>
                <p className="text-gray-600 text-[10px] leading-relaxed">
                  શું તમે ખરેખર <strong className="text-red-700 font-bold">{emp.name}</strong> ને સિસ્ટમમાંથી દૂર કરવા માંગો છો? આ ક્રિયા રદ થઈ શકશે નહીં.
                </p>
                <div className="flex gap-2 justify-center max-w-[180px] mx-auto pt-1">
                  <button
                    onClick={handleDelete}
                    disabled={isSubmitting}
                    className="flex-1 bg-[#8B2E2E] hover:bg-[#6e2323] text-white py-1 rounded text-xs font-bold transition-all"
                  >
                    હા
                  </button>
                  <button
                    onClick={() => setIsConfirmingDelete(false)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-1 rounded text-xs font-bold transition-all"
                  >
                    ના
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1 font-guj-body">
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-white hover:bg-amber-50 text-[11px] py-2 rounded border border-[#A9772F] text-[#A9772F] font-bold transition-all flex items-center justify-center gap-1"
                >
                  <Edit className="w-3.5 h-3.5" /> માહિતી સુધારો
                </button>
                <button
                  onClick={() => setIsResettingPass(true)}
                  className="bg-white hover:bg-amber-50 text-[11px] py-2 rounded border border-[#A9772F] text-[#A9772F] font-bold transition-all flex items-center justify-center gap-1"
                >
                  <Key className="w-3.5 h-3.5" /> નવો પાસવર્ડ
                </button>
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="col-span-2 bg-red-50 hover:bg-red-100 text-red-600 text-[11px] py-2 rounded border border-red-200 transition-all flex items-center justify-center gap-1.5 font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" /> કર્મચારી ડિલીટ કરો (Delete)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )}

      {/* 4. Elegant Inline Tab Selector Buttons */}
      {isSelected && (
        <div className="bg-[#A9772F]/10 border-t border-[#A9772F]/30 p-1 grid grid-cols-5 gap-1 text-[10px] font-bold font-guj-body">
          <button
            onClick={() => { setCardTab("stats"); setLocalError(""); }}
            className={`py-1.5 rounded transition-all flex flex-col items-center justify-center gap-0.5 ${
              cardTab === "stats" ? "bg-[#A9772F] text-white" : "text-gray-600 hover:bg-[#A9772F]/10"
            }`}
            title="પગાર વિગતો"
          >
            <span>📊</span>
            <span className="scale-90">વિગત</span>
          </button>
          <button
            onClick={() => { setCardTab("upad"); setLocalError(""); }}
            className={`py-1.5 rounded transition-all flex flex-col items-center justify-center gap-0.5 ${
              cardTab === "upad" ? "bg-[#8B2E2E] text-white" : "text-gray-600 hover:bg-[#8B2E2E]/10"
            }`}
            title="રોકડો ઉપાડ ઉમેરો"
          >
            <span>💸</span>
            <span className="scale-90">+ઉપાડ</span>
          </button>
          <button
            onClick={() => { setCardTab("pagar"); setLocalError(""); }}
            className={`py-1.5 rounded transition-all flex flex-col items-center justify-center gap-0.5 ${
              cardTab === "pagar" ? "bg-[#2F5D42] text-white" : "text-gray-600 hover:bg-[#2F5D42]/10"
            }`}
            title="હાજરી / ઓવરટાઈમ"
          >
            <span>📅</span>
            <span className="scale-90">+પગાર</span>
          </button>
          <button
            onClick={() => { setCardTab("gemini"); setLocalError(""); }}
            className={`py-1.5 rounded transition-all flex flex-col items-center justify-center gap-0.5 ${
              cardTab === "gemini" ? "bg-[#A9772F] text-white animate-pulse" : "text-gray-600 hover:bg-[#A9772F]/10"
            }`}
            title="શાહી જીની AI સહાયક"
          >
            <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
            <span className="scale-90">જીની</span>
          </button>
          <button
            onClick={() => { setCardTab("manage"); setLocalError(""); setIsEditing(false); setIsResettingPass(false); setIsConfirmingDelete(false); }}
            className={`py-1.5 rounded transition-all flex flex-col items-center justify-center gap-0.5 ${
              cardTab === "manage" ? "bg-gray-700 text-white" : "text-gray-600 hover:bg-gray-200"
            }`}
            title="કર્મચારી વ્યવસ્થાપન"
          >
            <span>⚙️</span>
            <span className="scale-90">મેનેજ</span>
          </button>
        </div>
      )}

      {isDashboardExpanded && (
        <div className="border-t border-[#A9772F]/30 bg-[#FAF5EB] p-4 space-y-5 animate-fade-in text-ledger-ink">
          
          {/* 2. All-time Histories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Withdrawals History */}
            <div className="bg-[#FFFDF9] p-3.5 rounded-lg border border-[#A9772F]/40 shadow-xs">
              <h4 className="font-bold text-[#8B2E2E] font-guj-title border-b border-[#A9772F]/30 pb-1.5 mb-2.5 flex items-center gap-1.5 text-xs">
                🔻 બધા ઉપાડનો ઇતિહાસ ({cardWithdrawals.length})
              </h4>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {cardWithdrawals.length === 0 ? (
                  <p className="text-[11px] text-gray-500 italic py-4 text-center font-guj-body">હજુ સુધી કોઈ ઉપાડ લીધેલ નથી.</p>
                ) : (
                  cardWithdrawals.map((w) => (
                    <div key={w.id} className="bg-white p-2 rounded border border-red-50 hover:border-red-150 transition-colors">
                      {editingWithdrawalId === w.id ? (
                        <div className="space-y-2 w-full text-left">
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="number"
                              value={editWithdrawalAmount}
                              onChange={(e) => setEditWithdrawalAmount(e.target.value)}
                              className="w-full px-2 py-1 bg-gray-50 rounded border text-xs font-mono font-bold focus:outline-none"
                              placeholder="Amount"
                            />
                            <input
                              type="text"
                              value={editWithdrawalNote}
                              onChange={(e) => setEditWithdrawalNote(e.target.value)}
                              className="w-full px-2 py-1 bg-gray-50 rounded border text-xs focus:outline-none"
                              placeholder="Note"
                            />
                          </div>
                          <div className="flex gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => handleSaveEditWithdrawal(w.id, w.monthlyRecordId)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded text-[10px] font-bold"
                            >
                              સેવ
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingWithdrawalId(null)}
                              className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-[10px]"
                            >
                              રદ કરો
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center w-full">
                          <div>
                            <span className="font-mono text-gray-400 block text-[9px] leading-tight">
                              {w.date?.seconds ? new Date(w.date.seconds * 1000).toLocaleDateString("gu-IN") : ""} ({w.monthlyRecordId})
                            </span>
                            <span className="font-bold text-gray-700 block text-xs">{w.note || "ઉપાડ"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#8B2E2E] text-xs">
                              -₹{w.amount}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleStartEditWithdrawal(w)}
                              className="text-blue-600 hover:text-blue-800 p-0.5 transition-colors"
                              title="સુધારો"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWithdrawal(w.id, w.monthlyRecordId)}
                              className="text-red-600 hover:text-red-800 p-0.5 transition-colors"
                              title="ડિલીટ કરો"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right: Monthly records wage logs */}
            <div className="bg-[#FFFDF9] p-3.5 rounded-lg border border-[#A9772F]/40 shadow-xs">
              <h4 className="font-bold text-[#2F5D42] font-guj-title border-b border-[#A9772F]/30 pb-1.5 mb-2.5 flex items-center gap-1.5 text-xs">
                🔺 માસિક પગાર ઇતિહાસ ({cardRecords.length})
              </h4>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {cardRecords.length === 0 ? (
                  <p className="text-[11px] text-gray-500 italic py-4 text-center font-guj-body">માસિક ઇતિહાસ ઉપલબ્ધ નથી.</p>
                ) : (
                  cardRecords.map((r) => (
                    <div key={r.id} className="flex justify-between items-center bg-white p-2 rounded border border-emerald-50 hover:border-emerald-150 transition-colors">
                      <div>
                        <span className="font-bold block text-xs text-gray-700">{r.year}/{String(r.month).padStart(2, '0')}</span>
                        <span className="text-gray-500 font-guj-body text-[10px]">દિવસો: {r.dutyDays} | ઓવરટાઇમ: ₹{r.overtimeAmount}</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-mono font-bold text-xs ${r.finalSalary >= 0 ? 'text-[#2F5D42]' : 'text-[#8B2E2E]'}`}>
                          ₹{r.finalSalary}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>



        </div>
      )}

    </div>
  );
}

interface AdminPanelProps {
  adminUid: string;
  onLogout: () => void;
  showInstallBtn?: boolean;
  onInstallApp?: () => void;
}

export default function AdminPanel({ adminUid, onLogout, showInstallBtn, onInstallApp }: AdminPanelProps) {
  // State lists
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<MonthlyRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Selected state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("2026_07");
  const [loadedMainKey, setLoadedMainKey] = useState<string>("");

  // Forms states
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpMobile, setNewEmpMobile] = useState("");
  const [newEmpLoginId, setNewEmpLoginId] = useState("");
  const [newEmpPassword, setNewEmpPassword] = useState("");
  const [newEmpSalary, setNewEmpSalary] = useState(15000);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const [resetEmpLoginId, setResetEmpLoginId] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");

  const [dutyDays, setDutyDays] = useState<number>(0);
  const [overtimeAmount, setOvertimeAmount] = useState<number>(0);
  const [withdrawalAmount, setWithdrawalAmount] = useState<number>(0);
  const [withdrawalNote, setWithdrawalNote] = useState<string>("");

  // Edit Employee state variables
  const [editEmpId, setEditEmpId] = useState("");
  const [editEmpName, setEditEmpName] = useState("");
  const [editEmpMobile, setEditEmpMobile] = useState("");
  const [editEmpSalary, setEditEmpSalary] = useState(15000);

  // All monthly records map for aggregated company stats
  const [allMonthlyRecords, setAllMonthlyRecords] = useState<{ [employeeId: string]: MonthlyRecord }>({});

  // System states
  const [loading, setLoading] = useState(true);
  const [formSuccess, setFormSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [activeTab, setActiveTab] = useState<"attendance" | "employees">("employees");

  // Filter lists for active selections
  const activeEmployee = employees.find(e => e.id === selectedEmployeeId) || null;
  const activeRecord = records.find(r => r.id === selectedMonth) || null;
  const activeWithdrawals = withdrawals.filter(w => w.monthlyRecordId === selectedMonth);

  // Aggregated Company Stats
  const totalEmployeesCount = employees.length;
  const totalWagesLiability = employees.reduce((sum, emp) => sum + emp.monthlySalary, 0);
  const totalAdvancesDisbursed = (Object.values(allMonthlyRecords) as MonthlyRecord[]).reduce((sum, rec) => sum + (rec.totalWithdrawals || 0), 0);
  const totalOvertimePaid = (Object.values(allMonthlyRecords) as MonthlyRecord[]).reduce((sum, rec) => sum + (rec.overtimeAmount || 0), 0);
  const netPayrollPayable = (Object.values(allMonthlyRecords) as MonthlyRecord[]).reduce((sum, rec) => sum + (rec.finalSalary || 0), 0);

  // 1. Fetch all active employees real-time
  useEffect(() => {
    const path = "employees";
    const unsubscribe = onSnapshot(collection(db, "employees"), (snap) => {
      const list: Employee[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status !== "inactive") {
          list.push({
            id: doc.id,
            name: d.name,
            mobile: d.mobile,
            employeeLoginId: d.employeeLoginId,
            authUid: d.authUid,
            monthlySalary: d.monthlySalary || 0,
            createdAt: d.createdAt
          });
        }
      });
      setEmployees(list);
      if (list.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(list[0].id);
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, []);

  // 1b. Fetch selected month's monthly record for all employees to calculate aggregate statistics
  useEffect(() => {
    if (employees.length === 0) return;
    
    // We subscribe to the selectedMonth document for each employee in real-time
    const unsubscribes = employees.map(emp => {
      const docRef = doc(db, "employees", emp.id, "monthlyRecords", selectedMonth);
      return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          setAllMonthlyRecords(prev => ({
            ...prev,
            [emp.id]: {
              id: docSnap.id,
              year: d.year,
              month: d.month,
              dutyDays: typeof d.dutyDays === 'number' ? d.dutyDays : undefined,
              overtimeAmount: d.overtimeAmount ?? 0,
              carryForwardIn: d.carryForwardIn ?? 0,
              totalEarned: d.totalEarned ?? 0,
              totalWithdrawals: d.totalWithdrawals ?? 0,
              finalSalary: d.finalSalary ?? 0,
              carryForwardOut: d.carryForwardOut ?? 0,
              updatedAt: d.updatedAt
            }
          }));
        } else {
          // Default empty/starting record if it doesn't exist yet
          const [yr, mn] = selectedMonth.split("_").map(Number);
          setAllMonthlyRecords(prev => ({
            ...prev,
            [emp.id]: {
              id: selectedMonth,
              year: yr,
              month: mn,
              dutyDays: undefined,
              overtimeAmount: 0,
              carryForwardIn: 0,
              totalEarned: 0,
              totalWithdrawals: 0,
              finalSalary: 0,
              carryForwardOut: 0,
              updatedAt: null
            }
          }));
        }
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [employees, selectedMonth]);

  // 2. Fetch selected employee's monthly records
  useEffect(() => {
    if (!selectedEmployeeId) return;
    const path = `employees/${selectedEmployeeId}/monthlyRecords`;
    const unsubscribe = onSnapshot(collection(db, "employees", selectedEmployeeId, "monthlyRecords"), (snap) => {
      const list: MonthlyRecord[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        list.push({
          id: doc.id,
          year: d.year,
          month: d.month,
          dutyDays: typeof d.dutyDays === 'number' ? d.dutyDays : undefined,
          overtimeAmount: d.overtimeAmount ?? 0,
          carryForwardIn: d.carryForwardIn ?? 0,
          totalEarned: d.totalEarned ?? 0,
          totalWithdrawals: d.totalWithdrawals ?? 0,
          finalSalary: d.finalSalary ?? 0,
          carryForwardOut: d.carryForwardOut ?? 0,
          updatedAt: d.updatedAt
        });
      });
      list.sort((a, b) => b.id.localeCompare(a.id));
      setRecords(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [selectedEmployeeId]);

  // 3. Fetch selected employee's withdrawals
  useEffect(() => {
    if (!selectedEmployeeId) return;
    const path = `employees/${selectedEmployeeId}/withdrawals`;
    const unsubscribe = onSnapshot(collection(db, "employees", selectedEmployeeId, "withdrawals"), (snap) => {
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
  }, [selectedEmployeeId]);

  // 4. Fetch all notifications to display in log
  useEffect(() => {
    if (!selectedEmployeeId) return;
    const q = query(collection(db, "notifications"), where("employeeId", "==", selectedEmployeeId));
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
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setNotifications(list);
    });

    return () => unsubscribe();
  }, [selectedEmployeeId]);

  // Sync state values when monthly records change (only once when selection changes)
  useEffect(() => {
    const currentKey = `${selectedEmployeeId}_${selectedMonth}`;
    if (activeRecord && loadedMainKey !== currentKey) {
      setDutyDays(activeRecord.dutyDays ?? 0);
      setOvertimeAmount(activeRecord.overtimeAmount ?? 0);
      setLoadedMainKey(currentKey);
    } else if (!activeRecord && loadedMainKey !== currentKey) {
      setDutyDays(0);
      setOvertimeAmount(0);
      setLoadedMainKey(currentKey);
    }
  }, [activeRecord, selectedMonth, selectedEmployeeId, loadedMainKey]);

  // Trigger recalculate on server
  const triggerRecalculate = async (empId: string, monthKey: string) => {
    try {
      await fetch("/api/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: empId, yearMonth: monthKey })
      });
    } catch (err) {
      console.error("Recalculation trigger failed:", err);
    }
  };

  // Create Employee Action
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSuccess("");
    setFormError("");
    try {
      const response = await fetch("/api/admin/create-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEmpName,
          mobile: newEmpMobile,
          employeeLoginId: newEmpLoginId,
          password: newEmpPassword,
          monthlySalary: newEmpSalary
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "કર્મચારી ઉમેરવામાં નિષ્ફળતા મળી.");
      }

      setFormSuccess(`કર્મચારી ${newEmpName} સફળતાપૂર્વક ઉમેરાયો છે!`);
      // Reset
      setNewEmpName("");
      setNewEmpMobile("");
      setNewEmpLoginId("");
      setNewEmpPassword("");
      setNewEmpSalary(15000);
      setSelectedEmployeeId(data.employeeId);
      setIsRegisterModalOpen(false);
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  // Reset Password Action
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSuccess("");
    setFormError("");
    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeLoginId: resetEmpLoginId,
          newPassword: resetNewPassword
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "પાસવર્ડ બદલવામાં નિષ્ફળતા.");
      }

      setFormSuccess(`કર્મચારી ${resetEmpLoginId} નો નવો પાસવર્ડ સેટ કરવામાં આવ્યો છે!`);
      setResetEmpLoginId("");
      setResetNewPassword("");
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  // Delete Employee Action
  const handleDeleteEmployee = async (empId: string) => {
    try {
      const response = await fetch("/api/admin/delete-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: empId })
      });
      if (response.ok) {
        setFormSuccess("કર્મચારી સફળતાપૂર્વક ડિલીટ કરાયો છે.");
        if (selectedEmployeeId === empId) {
          setSelectedEmployeeId("");
        }
      } else {
        const data = await response.json();
        throw new Error(data.error || "કર્મચારી ડિલીટ કરવામાં નિષ્ફળતા મળી.");
      }
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  // Direct Update Employee helper for inline cards
  const updateEmployeeDirect = async (empId: string, name: string, mobile: string, monthlySalary: number) => {
    setFormSuccess("");
    setFormError("");
    try {
      const response = await fetch("/api/admin/update-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: empId,
          name,
          mobile,
          monthlySalary,
          selectedMonth: selectedMonth
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "કર્મચારી સુધારવામાં નિષ્ફળતા મળી.");
      }

      setFormSuccess(`કર્મચારી ${name} ની માહિતી સફળતાપૂર્વક અપડેટ થઈ છે!`);
      
      // Send real-time notification
      try {
        await addDoc(collection(db, "notifications"), {
          employeeId: empId,
          type: "general",
          title: "प्रोफ़ाइल अपडेट 👤",
          message: `एडमिन ने आपकी प्रोफ़ाइल जानकारी (नाम / मोबाइल / नियत सैलरी) को अपडेट कर दिया है।`,
          isRead: false,
          createdAt: serverTimestamp()
        });
      } catch (notifErr) {
        console.warn("Failed to send profile edit notification:", notifErr);
      }
      return true;
    } catch (err: any) {
      setFormError(err.message);
      return false;
    }
  };

  // Direct Reset Password helper for inline cards
  const resetPasswordDirect = async (empLoginId: string, newPass: string) => {
    setFormSuccess("");
    setFormError("");
    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeLoginId: empLoginId,
          newPassword: newPass
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "પાસવર્ડ બદલવામાં નિષ્ફળતા.");
      }

      setFormSuccess(`કર્મચારી ${empLoginId} નો નવો પાસવર્ડ સેટ કરવામાં આવ્યો છે!`);
      return true;
    } catch (err: any) {
      setFormError(err.message);
      return false;
    }
  };

  // Edit Selection Change handler
  const handleEditSelectionChange = (empId: string) => {
    setEditEmpId(empId);
    if (!empId) {
      setEditEmpName("");
      setEditEmpMobile("");
      setEditEmpSalary(15000);
      return;
    }
    const emp = employees.find(e => e.id === empId);
    if (emp) {
      setEditEmpName(emp.name);
      setEditEmpMobile(emp.mobile);
      setEditEmpSalary(emp.monthlySalary);
    }
  };

  // Edit Employee Form Action
  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSuccess("");
    setFormError("");
    if (!editEmpId) {
      setFormError("કૃપા કરીને પહેલા કર્મચારી પસંદ કરો.");
      return;
    }

    try {
      const response = await fetch("/api/admin/update-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: editEmpId,
          name: editEmpName,
          mobile: editEmpMobile,
          monthlySalary: editEmpSalary,
          selectedMonth: selectedMonth
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "કર્મચારી સુધારવામાં નિષ્ફળતા મળી.");
      }

      setFormSuccess(`કર્મચારી ${editEmpName} ની માહિતી સફળતાપૂર્વક અપડેટ થઈ છે!`);
      
      // Send real-time notification
      try {
        await addDoc(collection(db, "notifications"), {
          employeeId: editEmpId,
          type: "general",
          title: "प्रोफ़ाइल अपडेट 👤",
          message: `एडमिन ने आपकी प्रोफ़ाइल जानकारी (नाम / मोबाइल / नियत सैलरी) को अपडेट कर दिया है।`,
          isRead: false,
          createdAt: serverTimestamp()
        });
      } catch (notifErr) {
        console.warn("Failed to send profile edit notification:", notifErr);
      }

      // Reset
      setEditEmpId("");
      setEditEmpName("");
      setEditEmpMobile("");
      setEditEmpSalary(15000);
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  // Update Days / Overtime in Firestore
  const handleUpdateMonthStats = async () => {
    if (!selectedEmployeeId) return;
    try {
      const recordRef = doc(db, "employees", selectedEmployeeId, "monthlyRecords", selectedMonth);
      const [year, month] = selectedMonth.split("_").map(Number);
      
      await setDoc(recordRef, {
        year,
        month,
        dutyDays: Number(dutyDays),
        overtimeAmount: Number(overtimeAmount),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Recalculate
      await triggerRecalculate(selectedEmployeeId, selectedMonth);
      
      // Send real-time notification
      await addDoc(collection(db, "notifications"), {
        employeeId: selectedEmployeeId,
        type: "pagar",
        title: "सैलरी अपडेट हुई 💸",
        message: `एडमिन ने इस महीने के लिए ड्यूटी दिन: ${dutyDays} और ओवरटाइम: ₹${overtimeAmount} अपडेट किया है।`,
        isRead: false,
        createdAt: serverTimestamp()
      });

      setFormSuccess("કર્મચારી માસિક પત્રક અપડેટ થયું છે!");
      setTimeout(() => setFormSuccess(""), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  // Add Withdrawal (Upad) Entry
  const handleAddWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || withdrawalAmount <= 0) return;

    try {
      const withdrawalsCol = collection(db, "employees", selectedEmployeeId, "withdrawals");
      await addDoc(withdrawalsCol, {
        monthlyRecordId: selectedMonth,
        date: serverTimestamp(),
        amount: Number(withdrawalAmount),
        note: withdrawalNote || "ઉપાડ",
        createdBy: adminUid,
        createdAt: serverTimestamp()
      });

      // Send notification record
      await addDoc(collection(db, "notifications"), {
        employeeId: selectedEmployeeId,
        type: "upad",
        title: "नया उपाड़ मिला 💸",
        message: `आपको इस महीने में ₹${withdrawalAmount} का उपाड़ मिला है। टिप्पणी: ${withdrawalNote || 'उपाड़'}`,
        amount: Number(withdrawalAmount),
        isRead: false,
        createdAt: serverTimestamp()
      });

      // Recalculate
      await triggerRecalculate(selectedEmployeeId, selectedMonth);

      setWithdrawalAmount(0);
      setWithdrawalNote("");
      setFormSuccess("નવો ઉપાડ સફળતાપૂર્વક ઉમેરાયો!");
      setTimeout(() => setFormSuccess(""), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3EBD8] flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#8B2E2E] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-bold font-guj-body text-gray-700">પગાર બુક લોડ થઈ રહી છે...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3EBD8] text-ledger-ink font-sans pb-10">
      
      {/* Admin Header Bar */}
      <header className="bg-[#8B2E2E] text-white py-4 px-4 shadow-md sticky top-0 z-10 border-b-2 border-[#A9772F]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <div>
              <h1 className="text-xl font-bold font-guj-title tracking-wide">સનશાઇન પગાર બુક (એડમિન)</h1>
              <p className="text-[10px] text-red-200 uppercase font-mono tracking-wider">Business Ledger Administration</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 flex-wrap">
            {/* Install App PWA Trigger */}
            {showInstallBtn && onInstallApp && (
              <button
                onClick={onInstallApp}
                className="bg-[#A9772F] hover:bg-[#b8853b] border border-[#f5cb87]/40 px-3 py-1.5 rounded text-xs flex items-center gap-1.5 font-bold font-guj-body transition-all shadow-sm transform active:scale-95 text-white"
                title="એપ ઇન્સ્ટોલ કરો (Install App)"
              >
                <Download className="w-4 h-4 text-white shrink-0" />
                <span>એપ ઇન્સ્ટોલ કરો</span>
              </button>
            )}

            {/* Active Month Selector */}
            <div className="flex items-center gap-2 bg-[#9C3B3B] px-3 py-1 rounded border border-[#A9772F]">
              <Calendar className="w-4 h-4 text-amber-200" />
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-sm font-mono focus:outline-none cursor-pointer bg-transparent text-white"
              >
                <option value="2026_01" className="text-black">જાન્યુઆરી 2026</option>
                <option value="2026_02" className="text-black">ફેબ્રુઆરી 2026</option>
                <option value="2026_03" className="text-black">માર્ચ 2026</option>
                <option value="2026_04" className="text-black">એપ્રિલ 2026</option>
                <option value="2026_05" className="text-black">મે 2026</option>
                <option value="2026_06" className="text-black">જૂન 2026</option>
                <option value="2026_07" className="text-black">જુલાઈ 2026</option>
                <option value="2026_08" className="text-black">ઓગસ્ટ 2026</option>
                <option value="2026_09" className="text-black">સપ્ટેમ્બર 2026</option>
                <option value="2026_10" className="text-black">ઓક્ટોબર 2026</option>
                <option value="2026_11" className="text-black">નવેમ્બર 2026</option>
                <option value="2026_12" className="text-black">ડિસેમ્બર 2026</option>
              </select>
            </div>

            {/* Tab Controllers */}
            <div className="flex rounded bg-[#9C3B3B] p-0.5 border border-[#A9772F] text-xs font-bold font-guj-body">
              <button 
                onClick={() => setActiveTab("attendance")}
                className={`px-3 py-1.5 rounded transition-all ${activeTab === 'attendance' ? 'bg-[#A9772F] text-white' : 'text-red-100 hover:text-white'}`}
              >
                હાજરી પત્રક
              </button>
              <button 
                onClick={() => setActiveTab("employees")}
                className={`px-3 py-1.5 rounded transition-all ${activeTab === 'employees' ? 'bg-[#A9772F] text-white' : 'text-red-100 hover:text-white'}`}
              >
                કર્મચારીઓ
              </button>
            </div>

            {/* Quick Register Employee Button */}
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 px-3 py-1.5 rounded text-xs flex items-center gap-1.5 font-bold font-guj-body transition-all shadow-sm transform active:scale-95"
              title="કર્મચારી બનાવો (Register Employee)"
            >
              <Plus className="w-4 h-4 text-emerald-100 shrink-0 stroke-[3px]" />
              <span className="hidden sm:inline">કર્મચારી બનાવો</span>
            </button>

            <button 
              onClick={onLogout}
              className="bg-red-800 hover:bg-red-900 border border-red-700 px-3 py-1.5 rounded text-xs flex items-center gap-1.5 font-bold font-guj-body transition-colors"
            >
              <LogOut className="w-4 h-4" /> એડમિન લોગઆઉટ
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Grid */}
      <main className="max-w-7xl mx-auto px-4 mt-6">
        
        {/* Banner notices */}
        {formSuccess && (
          <div className="flex items-center gap-2 text-[#2F5D42] bg-emerald-50 border border-emerald-300 p-3.5 rounded text-sm mb-4 font-guj-body animate-fade-in shadow-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{formSuccess}</span>
          </div>
        )}
        {formError && (
          <div className="flex items-center gap-2 text-[#8B2E2E] bg-red-50 border border-red-300 p-3.5 rounded text-sm mb-4 font-guj-body shadow-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}



        {/* ----------------- TAB: ATTENDANCE VIEW ----------------- */}
        {activeTab === "attendance" && (
          <div className="max-w-4xl mx-auto">
            <AttendanceView
              employees={employees}
              selectedYearMonth={selectedMonth}
              onAttendanceUpdated={() => {
                // Refresh list
                setFormSuccess("કર્મચારી હાજરી અપડેટ કરવામાં આવી છે અને નવું વેતન પત્રક ગણવામાં આવ્યું છે!");
                setTimeout(() => setFormSuccess(""), 4000);
              }}
            />
          </div>
        )}

        {/* ----------------- TAB: EMPLOYEES TAB ----------------- */}
        {activeTab === "employees" && (
          <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            
            {/* Professional Company Dashboard Summary Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 bg-[#FAF5EB] p-4 rounded-lg border border-[#A9772F] shadow-xs">
              <div className="col-span-2 md:col-span-5 border-b border-[#A9772F]/30 pb-1.5 mb-1 text-[#8B2E2E]">
                <h3 className="text-xs font-bold font-guj-title flex items-center gap-1.5">
                  📈 માસિક નાણાકીય સમીક્ષા (Company Monthly Financial Overview)
                </h3>
              </div>
              
              {/* Card 1: Total Employees */}
              <div className="bg-white p-3 rounded-lg border border-gray-200 flex flex-col justify-between shadow-2xs">
                <span className="text-[10px] text-gray-500 font-bold font-guj-body uppercase leading-none">કુલ કર્મચારીઓ</span>
                <span className="font-mono text-lg font-extrabold text-gray-800 mt-1">{totalEmployeesCount}</span>
              </div>

              {/* Card 2: Basic wages liability */}
              <div className="bg-white p-3 rounded-lg border border-gray-200 flex flex-col justify-between shadow-2xs">
                <span className="text-[10px] text-gray-500 font-bold font-guj-body uppercase leading-none">મૂળ માસિક બજેટ</span>
                <span className="font-mono text-lg font-extrabold text-gray-800 mt-1">₹{totalWagesLiability.toLocaleString()}</span>
              </div>

              {/* Card 3: Disbursed Advance */}
              <div className="bg-white p-3 rounded-lg border border-gray-200 flex flex-col justify-between shadow-2xs">
                <span className="text-[10px] text-gray-500 font-bold font-guj-body uppercase text-red-600 leading-none">કુલ ઉપાડ (આપેલ)</span>
                <span className="font-mono text-lg font-extrabold text-[#8B2E2E] mt-1">₹{totalAdvancesDisbursed.toLocaleString()}</span>
              </div>

              {/* Card 4: Overtime */}
              <div className="bg-white p-3 rounded-lg border border-gray-200 flex flex-col justify-between shadow-2xs">
                <span className="text-[10px] text-gray-500 font-bold font-guj-body uppercase text-green-700 leading-none">કુલ ઓવરટાઇમ</span>
                <span className="font-mono text-lg font-extrabold text-[#2F5D42] mt-1">₹{totalOvertimePaid.toLocaleString()}</span>
              </div>

              {/* Card 5: Net Payable */}
              <div className="bg-[#FAF5EB] p-3 rounded-lg border border-[#A9772F]/50 flex flex-col justify-between shadow-2xs col-span-2 md:col-span-1">
                <span className="text-[10px] text-[#8B2E2E] font-bold font-guj-body uppercase leading-none">ચૂકવવાપાત્ર ચોખ્ખો પગાર</span>
                <span className={`font-mono text-lg font-extrabold mt-1 ${netPayrollPayable >= 0 ? 'text-[#2F5D42]' : 'text-[#8B2E2E]'}`}>
                  ₹{Math.round(Number(netPayrollPayable)).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Gemini NL Natural-Language Command Bar */}
            <GeminiCommandBar
              selectedYearMonth={selectedMonth}
              adminUid={adminUid}
              onActionCompleted={() => {
                setFormSuccess("જીની કમાન્ડ સફળતાપૂર્વક લાગુ કરાઈ છે!");
                setTimeout(() => setFormSuccess(""), 4000);
              }}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Create employee form Card Call To Action (span 4) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-[#FAF5EB] rounded-lg border-2 border-[#A9772F] p-6 text-ledger-ink shadow-sm text-center">
                <div className="w-14 h-14 rounded-full bg-[#2F5D42]/10 text-[#2F5D42] flex items-center justify-center mx-auto mb-4 border border-[#2F5D42]/20">
                  <Plus className="w-7 h-7 stroke-[3px]" />
                </div>
                <h3 className="text-sm font-bold font-guj-title mb-2 text-[#8B2E2E]">નવો કર્મચારી ઉમેરો (Register)</h3>
                <p className="text-xs text-gray-600 font-guj-body mb-5 leading-relaxed">
                  અહીંથી તમે ફેક્ટરીના નવા કર્મચારીઓની નોંધણી કરી શકો છો. તેમનો નિયત માસિક પગાર, લૉગિન આઈડી અને પાસવર્ડ સેટ કરો જેથી તેઓ તેમની હાજરી અને ઉપાડ પત્રક જોઈ શકે.
                </p>
                <button
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="w-full bg-[#2F5D42] hover:bg-[#1f3e2b] text-white py-2.5 rounded text-xs font-bold font-guj-body shadow transition-all flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" /> કર્મચારી બનાવો (+ Register)
                </button>
              </div>
            </div>

            {/* Right Column: Employees Management Cards Grid (span 8) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="border-b-2 border-[#A9772F] pb-1.5 flex items-center justify-between">
                <h3 className="text-sm font-bold font-guj-title text-ledger-ink flex items-center gap-1.5">
                  <Users className="w-5 h-5 text-[#A9772F]" /> કર્મચારીઓ વ્યવસ્થાપન કાર્ડ્સ (Employee Management Cards)
                </h3>
                <span className="font-mono text-xs bg-amber-100 text-[#A9772F] px-2.5 py-0.5 rounded-full font-bold">
                  {employees.length} કુલ કર્મચારીઓ
                </span>
              </div>

              {employees.length === 0 ? (
                <div className="bg-[#FAF5EB] rounded-lg border border-[#A9772F] p-10 text-center text-gray-500 font-guj-body shadow-sm">
                  હજી સુધી કોઈ કર્મચારી ઉમેરાયા નથી. ડાબી બાજુથી નવો કર્મચારી બનાવો!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {employees.map((emp) => (
                    <EmployeeManagementCard
                      key={emp.id}
                      emp={emp}
                      onUpdate={updateEmployeeDirect}
                      onResetPassword={resetPasswordDirect}
                      onDelete={handleDeleteEmployee}
                      selectedMonth={selectedMonth}
                      adminUid={adminUid}
                      monthlyRecord={allMonthlyRecords[emp.id]}
                      triggerRecalculate={triggerRecalculate}
                      isSelected={selectedEmployeeId === emp.id}
                      onSelect={() => setSelectedEmployeeId(selectedEmployeeId === emp.id ? "" : emp.id)}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
          </div>
        )}

      </main>

      {/* Register Employee Modal Dialog */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#FAF5EB] rounded-lg border-2 border-[#A9772F] text-ledger-ink w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            
            {/* Modal Header */}
            <div className="bg-[#8B2E2E] text-white px-4 py-3 flex items-center justify-between border-b border-[#A9772F]">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-200" />
                <h3 className="text-sm font-bold font-guj-title">નવો કર્મચારી બનાવો (Register Employee)</h3>
              </div>
              <button 
                onClick={() => setIsRegisterModalOpen(false)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-1 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateEmployee} className="p-5 space-y-4 text-xs font-guj-body">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">કર્મચારીનું નામ (Full Name)</label>
                <input
                  type="text"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  placeholder="દા.ત. Kaushik Patel"
                  required
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B2E2E]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">મોબાઈલ નંબર (Mobile Number)</label>
                <input
                  type="text"
                  value={newEmpMobile}
                  onChange={(e) => setNewEmpMobile(e.target.value)}
                  placeholder="દા.ત. 9876543210"
                  required
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B2E2E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">લૉગિન આઈડી (ID)</label>
                  <input
                    type="text"
                    value={newEmpLoginId}
                    onChange={(e) => setNewEmpLoginId(e.target.value)}
                    placeholder="દા.ત. Kaushik"
                    required
                    className="w-full px-3 py-2 bg-white rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B2E2E] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">પાસવર્ડ (Password)</label>
                  <input
                    type="text"
                    value={newEmpPassword}
                    onChange={(e) => setNewEmpPassword(e.target.value)}
                    placeholder="દા.ત. Kaushik.123"
                    required
                    className="w-full px-3 py-2 bg-white rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B2E2E] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">માસિક નિયત પગાર (Wages/Month)</label>
                <input
                  type="number"
                  value={newEmpSalary}
                  onChange={(e) => setNewEmpSalary(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B2E2E] font-mono font-bold"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-[#2F5D42] hover:bg-[#1f3e2b] text-white py-2.5 rounded text-xs font-bold font-guj-body shadow transition-all flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" /> કર્મચારી બનાવો
                </button>
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2.5 rounded text-xs font-bold transition-all"
                >
                  રદ કરો (Cancel)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
