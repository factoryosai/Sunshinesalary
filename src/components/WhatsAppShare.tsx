/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import html2canvas from "html2canvas";
import { Share2, Image, MessageCircle, Download, CheckCircle } from "lucide-react";
import { MonthlyRecord, Employee } from "../types";

interface WhatsAppShareProps {
  elementId: string; // ID of the HTML element to capture (e.g. "ledger-card-capture")
  employee: Employee;
  record: MonthlyRecord | null;
  selectedYearMonth: string;
}

export default function WhatsAppShare({
  elementId,
  employee,
  record,
  selectedYearMonth,
}: WhatsAppShareProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [year, month] = selectedYearMonth.split("_");

  // Generate WhatsApp summary message text
  const generateTextMessage = () => {
    const finalSalary = record?.finalSalary ?? 0;
    const hasDutyDays = record && typeof record.dutyDays === 'number';
    const dutyDays = hasDutyDays ? record?.dutyDays : 0;
    const withdrawals = record?.totalWithdrawals ?? 0;
    const carryForwardOut = record?.carryForwardOut ?? 0;

    let text = `📚 *સનશાઇન પગાર બુક (Sunshine Pagar Book)* 📚\n`;
    text += `--------------------------------------\n`;
    text += `👤 *કર્મચારીનું નામ:* ${employee.name}\n`;
    text += `📅 *મહિનો:* ${month}/${year}\n`;
    text += `💼 *બેઝિક પગાર:* ₹${employee.monthlySalary}\n`;
    text += `🗓️ *કામના દિવસો:* ${dutyDays}\n`;
    text += `💸 *કુલ ઉપાડ (ડેબિટ):* ₹${withdrawals}\n`;
    text += `⚖️ *ચૂકવવાપાત્ર ચોખ્ખો પગાર:* ₹${finalSalary}\n`;
    if (carryForwardOut > 0) {
      text += `⚠️ *આગળ ખેંચાયેલ બાકી દેવું:* -₹${carryForwardOut}\n`;
    }
    text += `--------------------------------------\n`;
    text += `વધુ માહિતી જોવા માટે એપ્લિકેશનમાં લોગિન કરો.`;
    return encodeURIComponent(text);
  };

  const handleShare = async () => {
    setLoading(true);
    setSuccess(null);
    try {
      const element = document.getElementById(elementId);
      if (!element) {
        throw new Error("Ledger card container was not found.");
      }

      // Generate canvas screenshot of the ledger card
      const canvas = await html2canvas(element, {
        backgroundColor: "#F3EBD8",
        scale: 2, // higher resolution
        useCORS: true,
      });

      const dataUrl = canvas.toDataURL("image/png");

      // Convert dataURL to Blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `ledger_${employee.name}_${selectedYearMonth}.png`, {
        type: "image/png",
      });

      // Try native sharing first
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `સેલરી સ્લીપ - ${employee.name}`,
          text: `સનશાઇન પગાર બુક લિજર ${month}/${year}`,
        });
        setSuccess("લેજર છબી સફળતાપૂર્વક શેર કરવામાં આવી!");
      } else {
        // Fallback: Open WhatsApp deep link and let user download the image card manually
        const whatsappUrl = `https://api.whatsapp.com/send?text=${generateTextMessage()}`;
        window.open(whatsappUrl, "_blank");

        // Auto trigger image download for ease of manual attachment
        const link = document.createElement("a");
        link.download = `ledger_${employee.name}_${selectedYearMonth}.png`;
        link.href = dataUrl;
        link.click();
        
        setSuccess("વોટ્સએપ મેસેજ ખોલવામાં આવ્યો અને છબી ડાઉનલોડ થઈ ગઈ છે!");
      }
    } catch (error: any) {
      console.error("WhatsApp share failed:", error);
      // Hard fallback if canvas or sharing crashed
      const whatsappUrl = `https://api.whatsapp.com/send?text=${generateTextMessage()}`;
      window.open(whatsappUrl, "_blank");
      setSuccess("વોટ્સએપ મેસેજ મોકલવામાં આવ્યો!");
    } finally {
      setLoading(false);
      setTimeout(() => setSuccess(null), 4000);
    }
  };

  // Plain download image function
  const handleDownloadOnly = async () => {
    setLoading(true);
    try {
      const element = document.getElementById(elementId);
      if (!element) return;
      const canvas = await html2canvas(element, {
        backgroundColor: "#F3EBD8",
        scale: 2,
        useCORS: true,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `ledger_${employee.name}_${selectedYearMonth}.png`;
      link.href = dataUrl;
      link.click();
      setSuccess("લેજર બુક છબી ડાઉનલોડ થઈ ગઈ છે!");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setTimeout(() => setSuccess(null), 4000);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-4 max-w-4xl mx-auto font-sans">
      <div className="flex flex-wrap gap-2.5">
        {/* Share on WhatsApp trigger button */}
        <button
          type="button"
          onClick={handleShare}
          disabled={loading}
          className="bg-[#2F5D42] hover:bg-[#20442E] text-white px-4 py-2 rounded text-xs font-bold font-guj-body flex items-center gap-1.5 shadow transition-all disabled:opacity-50"
        >
          <MessageCircle className="w-4 h-4 text-emerald-300" />
          {loading ? "છબી બની રહી છે..." : "વોટ્સએપ પર લેજર શેર કરો (Share)"}
        </button>

        {/* Download Image Card button */}
        <button
          type="button"
          onClick={handleDownloadOnly}
          disabled={loading}
          className="bg-white border-2 border-[#A9772F] text-[#A9772F] hover:bg-amber-50 px-4 py-1.5 rounded text-xs font-bold font-guj-body flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          લેજર ડાઉનલોડ (Download Image)
        </button>
      </div>

      {success && (
        <p className="text-xs text-green-700 font-guj-body bg-emerald-50 px-2.5 py-1.5 rounded border border-emerald-200 mt-1 flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5" /> {success}
        </p>
      )}
    </div>
  );
}
