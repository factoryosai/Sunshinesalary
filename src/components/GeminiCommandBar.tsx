/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Sparkles, CheckCircle2, XCircle, AlertCircle, HelpCircle, CornerDownLeft } from "lucide-react";
import { collection, addDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

interface GeminiCommandBarProps {
  selectedYearMonth: string; // "YYYY_MM"
  onActionCompleted: () => void;
  adminUid: string;
}

export default function GeminiCommandBar({
  selectedYearMonth,
  onActionCompleted,
  adminUid,
}: GeminiCommandBarProps) {
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Results states
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [clarifyResult, setClarifyResult] = useState<string | null>(null);
  const [writeIntent, setWriteIntent] = useState<{
    employee_login_id: string;
    operation: "add_withdrawal" | "add_overtime";
    amount: number;
    note: string;
    month: number;
    year: number;
  } | null>(null);

  const [writeSuccess, setWriteSuccess] = useState<string | null>(null);

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    setLoading(true);
    setError("");
    setQueryResult(null);
    setClarifyResult(null);
    setWriteIntent(null);
    setWriteSuccess(null);

    try {
      const response = await fetch("/api/gemini-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: command.trim(),
          selectedMonth: selectedYearMonth,
        }),
      });

      if (!response.ok) {
        throw new Error("સર્વર પ્રતિસાદ આપવામાં અસમર્થ છે.");
      }

      const data = await response.json();

      if (data.action === "query") {
        setQueryResult(data.resultText);
      } else if (data.action === "clarify") {
        setClarifyResult(data.clarifying_question || "કૃપા કરીને ફરીથી સ્પષ્ટ રીતે કહો, હું સમજી શક્યો નથી.");
      } else if (data.action === "write") {
        if (!data.employee_login_id || !data.amount) {
          setClarifyResult("ક્ષમા કરશો, હું કર્મચારીનું નામ અથવા રકમ ઓળખી શક્યો નથી. કૃપા કરીને ફરી પ્રયાસ કરો.");
        } else {
          setWriteIntent({
            employee_login_id: data.employee_login_id,
            operation: data.operation || "add_withdrawal",
            amount: data.amount,
            note: data.note || "NL Command entry",
            month: data.month || parseInt(selectedYearMonth.split("_")[1], 10),
            year: data.year || parseInt(selectedYearMonth.split("_")[0], 10),
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setError("કમાન્ડ પ્રોસેસ કરવામાં ભૂલ આવી. કૃપા કરીને તમારું નેટવર્ક કનેક્શન અને API કી તપાસો.");
    } finally {
      setLoading(false);
    }
  };

  // Perform Firestore write upon Admin confirmation
  const handleConfirmWrite = async () => {
    if (!writeIntent) return;
    setLoading(true);
    try {
      const targetMonthKey = `${writeIntent.year}_${String(writeIntent.month).padStart(2, '0')}`;
      const noteToSave = writeIntent.note || (writeIntent.operation === "add_withdrawal" ? "ઉપાડ" : "ઓવરટાઇમ");

      if (writeIntent.operation === "add_withdrawal" || writeIntent.operation as string === "add_upad") {
        // 1. Add withdrawal entry
        const withdrawalsCol = collection(db, "employees", writeIntent.employee_login_id, "withdrawals");
        await addDoc(withdrawalsCol, {
          monthlyRecordId: targetMonthKey,
          date: serverTimestamp(),
          amount: writeIntent.amount,
          note: noteToSave,
          createdBy: adminUid,
          createdAt: serverTimestamp(),
        });

        // 2. Add Notification
        const notificationsCol = collection(db, "notifications");
        await addDoc(notificationsCol, {
          employeeId: writeIntent.employee_login_id,
          type: "upad",
          title: "नया उपाड़ मिला 💸",
          message: `आपको इस महीने में ₹${writeIntent.amount} का उपाड़ मिला है। टिप्पणी: ${noteToSave}`,
          amount: writeIntent.amount,
          isRead: false,
          createdAt: serverTimestamp(),
        });

      } else {
        // 3. Add Overtime entry directly to monthlyRecord
        const recordRef = collection(db, "employees", writeIntent.employee_login_id, "monthlyRecords");
        // We set/merge the overtime amount
        const monthlyRecDoc = `${writeIntent.year}_${String(writeIntent.month).padStart(2, '0')}`;
        const recordDocRef = addDoc(collection(db, "employees", writeIntent.employee_login_id, "monthlyRecords"), {
          overtimeAmount: writeIntent.amount,
          updatedAt: serverTimestamp(),
        });
      }

      // Recalculate
      await fetch("/api/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: writeIntent.employee_login_id,
          yearMonth: targetMonthKey,
        }),
      });

      setWriteSuccess(`સફળતાપૂર્વક ${writeIntent.employee_login_id} ના ખાતામાં ₹${writeIntent.amount} નો ઉપાડ ઉમેરવામાં આવ્યો છે!`);
      setWriteIntent(null);
      setCommand("");
      onActionCompleted();
      setTimeout(() => setWriteSuccess(null), 5000);
    } catch (err: any) {
      console.error(err);
      setError("ડેટા સેવ કરવામાં ભૂલ આવી.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelWrite = () => {
    setWriteIntent(null);
  };

  return (
    <div className="bg-[#FAF5EB] rounded border-2 border-[#A9772F] p-4 text-ledger-ink mb-6 shadow-sm">
      <div className="flex items-center gap-2 mb-2 border-b border-[#A9772F] pb-1.5">
        <Sparkles className="w-5 h-5 text-[#A9772F] animate-pulse" />
        <h3 className="text-md font-bold font-guj-title">
          શાહી અવાજ કમાન્ડર (AI Gemini Command Bar)
        </h3>
      </div>

      <p className="text-xs text-gray-600 font-guj-body mb-3">
        તમે ગુજરાતી, હિન્દી અથવા અંગ્રેજી મિશ્રિત લખી શકો છો.
        <strong> દા.ત: </strong> 
        <span className="italic">"Kaushik ko 5000 upad diya"</span> અથવા 
        <span className="italic"> "Kaushik ka total upad kitna hai"</span>
      </p>

      {/* Main Form */}
      <form onSubmit={handleSendCommand} className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="દા.ત. Kaushik ko 3000 upad diya"
            className="w-full px-3 py-2 bg-white rounded border border-[#A9772F] text-sm focus:outline-none focus:ring-1 focus:ring-[#A9772F] font-guj-body pr-10"
            disabled={loading}
          />
          <button 
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-[#A9772F]"
          >
            <CornerDownLeft className="w-4 h-4" />
          </button>
        </div>
        <button
          type="submit"
          disabled={loading || !command.trim()}
          className="bg-[#A9772F] hover:bg-[#8e6122] text-white px-4 py-2 rounded text-sm font-bold font-guj-body flex items-center gap-1.5 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          {loading ? "પ્રોસેસ..." : "મોકલો"}
        </button>
      </form>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-[#8B2E2E] bg-red-50 border border-red-200 p-3 rounded text-sm mb-2 font-guj-body">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success notification */}
      {writeSuccess && (
        <div className="flex items-center gap-2 text-[#2F5D42] bg-emerald-50 border border-emerald-300 p-3 rounded text-sm mb-2 font-guj-body">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{writeSuccess}</span>
        </div>
      )}

      {/* 1. Query Result Panel */}
      {queryResult && (
        <div className="bg-emerald-50 border-l-4 border-[#2F5D42] p-3 rounded-r text-sm text-ledger-ink font-guj-body mb-2 shadow-sm animate-fade-in">
          <div className="font-bold text-xs text-[#2F5D42] uppercase tracking-wider mb-1">
            🤖 જીની નો જવાબ (Gemini Query Result):
          </div>
          <p className="text-sm font-medium">{queryResult}</p>
        </div>
      )}

      {/* 2. Clarify / Helper Panel */}
      {clarifyResult && (
        <div className="bg-amber-50 border-l-4 border-[#A9772F] p-3 rounded-r text-sm text-ledger-ink font-guj-body mb-2 shadow-sm">
          <div className="font-bold text-xs text-[#A9772F] uppercase tracking-wider mb-1 flex items-center gap-1">
            <HelpCircle className="w-4 h-4" /> વધુ સ્પષ્ટતા જરૂરી છે:
          </div>
          <p className="text-sm font-medium">{clarifyResult}</p>
        </div>
      )}

      {/* 3. Write intent Confirmation visual card */}
      {writeIntent && (
        <div className="bg-red-50 border-2 border-[#8B2E2E] p-4 rounded text-ledger-ink font-guj-body mb-2 shadow-md animate-bounce-short">
          <div className="font-bold text-[#8B2E2E] text-sm uppercase tracking-wider mb-2 border-b border-red-200 pb-1 flex items-center gap-1.5">
            ⚠️ કન્ફર્મ કરો (Write Action Confirmation)
          </div>
          <p className="text-sm mb-4">
            શું તમે કર્મચારી <strong>{writeIntent.employee_login_id}</strong> માટે 
            ₹<strong>{writeIntent.amount}</strong> નો 
            <strong> {writeIntent.operation === "add_withdrawal" ? "ઉપાડ (Advance)" : "ઓવરટાઇમ (Overtime)"}</strong> ઉમેરવા માંગો છો?
            {writeIntent.note && <span className="block mt-1 text-xs text-gray-500">નોંધ: {writeIntent.note}</span>}
          </p>

          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={handleCancelWrite}
              className="px-4 py-2 border border-gray-300 rounded text-xs bg-white text-gray-700 hover:bg-gray-100 font-bold transition-all"
            >
              ના, કેન્સલ કરો (No)
            </button>
            <button
              type="button"
              onClick={handleConfirmWrite}
              className="px-5 py-2 bg-[#8B2E2E] hover:bg-[#6b2222] text-white rounded text-xs font-bold transition-all shadow-sm"
            >
              હા, ઉમેરો (Yes)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
