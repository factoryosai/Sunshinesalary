/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ArrowDownRight, AlertTriangle, Coins, Calendar, Tag, ChevronRight } from "lucide-react";
import { Withdrawal, MonthlyRecord } from "../types";

interface LedgerCardProps {
  record: MonthlyRecord | null;
  withdrawals: Withdrawal[];
  monthlySalary: number;
  language: "gu" | "hi"; // gu = Gujarati for Admin, hi = Hindi for Employee
  showTitle?: boolean;
}

export default function LedgerCard({
  record,
  withdrawals,
  monthlySalary,
  language,
  showTitle = true,
}: LedgerCardProps) {
  // Locale mappings
  const labels = {
    gu: {
      withdrawals: "કુલ ઉપાડ (ડેબિટ)",
      salaryEarned: "મળેલો પગાર (ક્રેડિટ)",
      baseSalary: "માસિક બેઝિક પગાર",
      dutyDays: "ડ્યુટી દિવસો",
      overtime: "ઓવરટાઇમ રકમ",
      carryForwardIn: "ગયા મહિનાની બાકી રકમ (કપાત)",
      finalSalary: "ચૂકવવાપાત્ર ચોખ્ખો પગાર",
      carryForwardOut: "આગામી મહિને કપાશે (બાકી દેવું)",
      noWithdrawals: "આ મહિને કોઈ ઉપાડ નથી.",
      rupees: "₹",
      days: "દિવસો",
      ledgerTitle: "ખાતા વહી પત્રક",
      note: "નોંધ",
      date: "તારીખ",
    },
    hi: {
      withdrawals: "कुल उपाड़ (डेबिट)",
      salaryEarned: "कुल सैलरी (क्रेडिट)",
      baseSalary: "मासिक बेसिक वेतन",
      dutyDays: "ड्यूटी के दिन",
      overtime: "ओवरटाइम राशि",
      carryForwardIn: "पिछले महीने का बकाया (कटौती)",
      finalSalary: "भुगतान योग्य शुद्ध सैलरी",
      carryForwardOut: "अगले महीने काटा जाएगा (बकाया)",
      noWithdrawals: "इस महीने कोई उपाड़ नहीं लिया गया।",
      rupees: "₹",
      days: "दिन",
      ledgerTitle: "खाता बही पत्रक",
      note: "टिप्पणी",
      date: "दिनांक",
    }
  };

  const l = labels[language];

  // Calculations
  const hasRecord = !!record;
  const hasDutyDays = record && typeof record.dutyDays === 'number';
  
  const dutyDays = hasDutyDays ? record.dutyDays : null;
  const overtimeAmount = hasDutyDays ? (record?.overtimeAmount ?? 0) : 0;
  const carryForwardIn = record?.carryForwardIn ?? 0;
  
  const totalEarned = hasDutyDays ? (record?.totalEarned ?? (monthlySalary / 26) * (dutyDays ?? 0)) : 0;
  const totalWithdrawals = record?.totalWithdrawals ?? withdrawals.reduce((sum, w) => sum + w.amount, 0);
  
  const finalSalary = hasDutyDays 
    ? (record?.finalSalary ?? (totalEarned + overtimeAmount - totalWithdrawals - carryForwardIn))
    : -(totalWithdrawals + carryForwardIn);

  const carryForwardOut = hasDutyDays
    ? (record?.carryForwardOut ?? (finalSalary < 0 ? Math.abs(finalSalary) : 0))
    : (totalWithdrawals + carryForwardIn);

  // Format date for display
  const formatDate = (dateInput: any) => {
    if (!dateInput) return "";
    let d: Date;
    if (typeof dateInput.toDate === "function") {
      d = dateInput.toDate();
    } else {
      d = new Date(dateInput);
    }
    return d.toLocaleDateString(language === "gu" ? "gu-IN" : "hi-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  return (
    <div className="border-2 border-[#A9772F] rounded bg-[#F5EFE0] shadow-md p-4 max-w-4xl mx-auto font-sans text-ledger-ink">
      {showTitle && (
        <div className="flex items-center justify-between border-b-2 border-dashed border-[#A9772F] pb-3 mb-4">
          <h3 className={`text-xl font-bold tracking-wide ${language === 'gu' ? 'font-guj-title' : 'font-hindi-title'}`}>
            📖 {l.ledgerTitle} {record ? `(${record.year}/${String(record.month).padStart(2, '0')})` : ""}
          </h3>
          <span className="text-xs font-mono px-2 py-1 bg-white rounded border border-[#A9772F] text-[#A9772F] uppercase">
            {language === 'gu' ? 'લેજર કાર્ડ' : 'लेजर कार्ड'}
          </span>
        </div>
      )}

      {/* Main Ledger Two-Column Container */}
      <div className="flex flex-col md:flex-row gap-6 relative">
        
        {/* Left Column: Withdrawals (ઉપાડ / उपाड़) - Maroon Accent */}
        <div className="flex-1">
          <div className="flex items-center justify-between border-b border-[#8B2E2E] pb-2 mb-3">
            <span className={`text-sm font-bold text-[#8B2E2E] flex items-center gap-2 ${language === 'gu' ? 'font-guj-body' : 'font-hindi-body'}`}>
              🔻 {l.withdrawals}
            </span>
            <span className="font-mono font-bold text-[#8B2E2E] bg-[#FADBD8] px-2 py-0.5 rounded text-sm">
              - ₹{totalWithdrawals.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
            {withdrawals.length === 0 ? (
              <p className={`text-sm italic text-gray-500 py-4 text-center ${language === 'gu' ? 'font-guj-body' : 'font-hindi-body'}`}>
                {l.noWithdrawals}
              </p>
            ) : (
              withdrawals.map((w) => (
                <div 
                  key={w.id} 
                  className="flex justify-between items-center bg-[#FAF5EB] p-2 rounded border border-red-100 hover:border-[#8B2E2E] transition-all text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-mono text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {formatDate(w.date)}
                    </span>
                    {w.note && (
                      <span className="text-gray-700 font-medium flex items-center gap-1 truncate max-w-[180px]">
                        <Tag className="w-3 h-3 text-[#A9772F]" /> {w.note}
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-[#8B2E2E] text-sm">
                    -₹{w.amount}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Vertical Separator Red Dashed Spine */}
        <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px border-l-2 border-dashed border-[#8B2E2E]" style={{ transform: 'translateX(-50%)' }}></div>

        {/* Right Column: Earnings (પગાર / सैलरी) - Green Accent */}
        <div className="flex-1">
          <div className="flex items-center justify-between border-b border-[#2F5D42] pb-2 mb-3">
            <span className={`text-sm font-bold text-[#2F5D42] flex items-center gap-2 ${language === 'gu' ? 'font-guj-body' : 'font-hindi-body'}`}>
              🔺 {l.salaryEarned}
            </span>
            <span className="font-mono font-bold text-[#2F5D42] bg-[#D4EFDF] px-2 py-0.5 rounded text-sm">
              + ₹{(Math.round((totalEarned + overtimeAmount) * 100) / 100).toLocaleString('en-IN')}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            {/* Base monthly Salary */}
            <div className="flex justify-between items-center bg-[#FAF5EB] p-2 rounded">
              <span className={`text-xs text-gray-600 ${language === 'gu' ? 'font-guj-body' : 'font-hindi-body'}`}>{l.baseSalary}</span>
              <span className="font-mono font-medium">₹{monthlySalary.toLocaleString('en-IN')}</span>
            </div>

            {/* Duty Days worked */}
            <div className="flex justify-between items-center bg-[#FAF5EB] p-2 rounded">
              <span className={`text-xs text-gray-600 flex items-center gap-1 ${language === 'gu' ? 'font-guj-body' : 'font-hindi-body'}`}>
                {l.dutyDays}
              </span>
              <span className="font-mono font-medium">
                {hasDutyDays ? dutyDays : 0} {l.days} (₹{Math.round(totalEarned).toLocaleString('en-IN')})
              </span>
            </div>

            {/* Overtime */}
            {overtimeAmount > 0 && (
              <div className="flex justify-between items-center bg-green-50 p-2 rounded border border-green-200">
                <span className={`text-xs text-green-700 flex items-center gap-1 ${language === 'gu' ? 'font-guj-body' : 'font-hindi-body'}`}>
                  ⭐ {l.overtime}
                </span>
                <span className="font-mono font-bold text-[#2F5D42]">+₹{overtimeAmount.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Carry Forward In (If negative from previous month) */}
            {carryForwardIn > 0 && (
              <div className="flex justify-between items-center bg-red-50 p-2 rounded border border-red-200">
                <span className={`text-xs text-[#8B2E2E] flex items-center gap-1 font-bold ${language === 'gu' ? 'font-guj-body' : 'font-hindi-body'}`}>
                  <AlertTriangle className="w-3.5 h-3.5" /> {l.carryForwardIn}
                </span>
                <span className="font-mono font-bold text-[#8B2E2E]">-₹{carryForwardIn.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Spine Separator */}
            <div className="border-t border-[#A9772F] my-2"></div>

            {/* Final Calculated net salary */}
            <div className="flex justify-between items-center bg-[#FFFBEB] p-2.5 rounded border border-[#A9772F]">
              <span className={`text-xs font-bold text-[#2B2620] flex items-center gap-1 ${language === 'gu' ? 'font-guj-body' : 'font-hindi-body'}`}>
                ⚖️ {l.finalSalary}
              </span>
              <span className={`font-mono font-bold text-lg ${finalSalary >= 0 ? "text-[#2F5D42]" : "text-[#8B2E2E]"}`}>
                ₹{finalSalary.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Negative / Carry Forward Out Warn Indicator */}
            {carryForwardOut > 0 && (
              <div className="flex items-center gap-2 text-[#8B2E2E] bg-red-50 border border-red-300 p-2 rounded text-xs mt-2 animate-pulse">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className={`${language === 'gu' ? 'font-guj-body' : 'font-hindi-body'}`}>
                  <strong>{l.carryForwardOut}:</strong> -₹{carryForwardOut.toLocaleString('en-IN')} (આગામી મહિનાના પગારમાંથી કાપવામાં આવશે)
                </span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
