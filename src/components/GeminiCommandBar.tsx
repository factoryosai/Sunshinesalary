/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  CornerDownLeft, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX 
} from "lucide-react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
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

  // Voice & Speech State
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true); // default voice response ON for interactive demo
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Prime voices in standard Synthesis
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }

    // Check for browser speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const rec = new SpeechRecognition();
      rec.lang = "gu-IN"; // Set to Gujarati (will transcribe Hindi/English too when spoken phonetically)
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setIsListening(true);
        setError("");
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        if (event.error === "no-speech") {
          setError("કોઈ અવાજ સંભળાયો નથી. કૃપા કરીને ફરી બોલો.");
        } else if (event.error === "not-allowed") {
          setError("માઇક્રોફોન એક્સેસ કરવાની મંજૂરી આપો.");
        } else {
          setError("ચેટ-ટુ-સ્પીચ દરમિયાન કોઈ ભૂલ આવી.");
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setCommand(transcript);
          sendCommandText(transcript);
        }
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Text-To-Speech function
  const speakText = (text: string) => {
    if (!voiceMode) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel(); // cancel current speech

      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      
      // Look for Gujarati, Hindi or Indian English
      const guVoice = voices.find(v => v.lang.startsWith("gu"));
      const hiVoice = voices.find(v => v.lang.startsWith("hi"));
      const enInVoice = voices.find(v => v.lang.startsWith("en-IN") || v.lang.startsWith("en_IN"));

      if (guVoice) {
        utterance.voice = guVoice;
        utterance.lang = "gu-IN";
      } else if (hiVoice) {
        utterance.voice = hiVoice;
        utterance.lang = "hi-IN";
      } else if (enInVoice) {
        utterance.voice = enInVoice;
        utterance.lang = "en-IN";
      }

      utterance.rate = 1.05; // natural rate
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startSpeechRecognition = () => {
    if (recognitionRef.current) {
      // Cancel previous speech if listening starts
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error("Start recognition err:", err);
      }
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const sendCommandText = async (commandString: string) => {
    if (!commandString.trim()) return;

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
          command: commandString.trim(),
          selectedMonth: selectedYearMonth,
        }),
      });

      if (!response.ok) {
        throw new Error("સર્વર પ્રતિસાદ આપવામાં અસમર્થ છે.");
      }

      const data = await response.json();

      if (data.action === "query") {
        setQueryResult(data.resultText);
        if (data.resultText) {
          speakText(data.resultText);
        }
      } else if (data.action === "clarify") {
        const clarifyMsg = data.clarifying_question || "કૃપા કરીને ફરીથી સ્પષ્ટ રીતે કહો, હું સમજી શક્યો નથી.";
        setClarifyResult(clarifyMsg);
        speakText(clarifyMsg);
      } else if (data.action === "write") {
        if (!data.employee_login_id || !data.amount) {
          const errMsg = "ક્ષમા કરશો, હું કર્મચારીનું નામ અથવા રકમ ઓળખી શક્યો નથી. કૃપા કરીને ફરી પ્રયાસ કરો.";
          setClarifyResult(errMsg);
          speakText(errMsg);
        } else {
          const intent = {
            employee_login_id: data.employee_login_id,
            operation: data.operation || "add_withdrawal",
            amount: data.amount,
            note: data.note || "NL Command entry",
            month: data.month || parseInt(selectedYearMonth.split("_")[1], 10),
            year: data.year || parseInt(selectedYearMonth.split("_")[0], 10),
          };
          setWriteIntent(intent);

          // Formulate confirmation speech
          const operationNameGuj = intent.operation === "add_withdrawal" ? "ઉપાડ" : "ઓવરટાઇમ";
          const confirmationSpeech = `શું તમે કર્મચારી ${intent.employee_login_id} માટે ₹${intent.amount} નો ${operationNameGuj} ઉમેરવા માંગો છો? કન્ફર્મ કરવા માટે હા, ઉમેરો દબાવો.`;
          speakText(confirmationSpeech);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError("કમાન્ડ પ્રોસેસ કરવામાં ભૂલ આવી. કૃપા કરીને તમારું નેટવર્ક કનેક્શન તપાસો.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    sendCommandText(command);
  };

  // Perform Firestore write upon Admin confirmation
  const handleConfirmWrite = async () => {
    if (!writeIntent) return;
    setLoading(true);
    try {
      const targetMonthKey = `${writeIntent.year}_${String(writeIntent.month).padStart(2, '0')}`;
      const noteToSave = writeIntent.note || (writeIntent.operation === "add_withdrawal" ? "ઉપાડ" : "ઓવરટાઇમ");

      if (writeIntent.operation === "add_withdrawal" || (writeIntent.operation as string) === "add_upad") {
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
        await addDoc(collection(db, "employees", writeIntent.employee_login_id, "monthlyRecords"), {
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

      const successMsg = `સફળતાપૂર્વક ${writeIntent.employee_login_id} ના ખાતામાં ₹${writeIntent.amount} નો ઉપાડ ઉમેરવામાં આવ્યો છે!`;
      setWriteSuccess(successMsg);
      speakText(`સફળતાપૂર્વક ઉપાડ ઉમેરવામાં આવ્યો છે.`);
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
    speakText("ક્રિયા કેન્સલ કરવામાં આવી.");
  };

  return (
    <div className="bg-[#FAF5EB] rounded border-2 border-[#A9772F] p-4 text-ledger-ink mb-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#A9772F] pb-1.5 mb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#A9772F] animate-pulse" />
          <h3 className="text-md font-bold font-guj-title">
            શાહી અવાજ કમાન્ડર (AI Gemini Command Bar)
          </h3>
        </div>
      </div>

      {/* Language instructions and Voice mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-[#FAF5EB] border-b border-[#A9772F]/20 pb-2">
        <p className="text-xs text-gray-600 font-guj-body flex-1 min-w-[280px]">
          તમે ગુજરાતી, હિન્દી અથવા અંગ્રેજી મિશ્રિત બોલી કે લખી શકો છો.
          <strong> દા.ત: </strong> 
          <span className="italic text-gray-700">"kaushik ne 5000 upad didho"</span>, 
          <span className="italic text-gray-700"> "kaushik no total upad ketlo che"</span>, 
          <span className="italic text-gray-700"> "kaushik na aa mahinano ketlo pagar thyo"</span>, 
          <span className="italic text-gray-700"> "kaushik ne upad bad karta 25 divas no pagar ketlo thyo"</span>
        </p>
        <button
          type="button"
          onClick={() => {
            const nextMode = !voiceMode;
            setVoiceMode(nextMode);
            if (nextMode) {
              speakText("અવાજ પ્રતિભાવ ચાલુ છે");
            } else {
              if ("speechSynthesis" in window) {
                window.speechSynthesis.cancel();
              }
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all border ${
            voiceMode 
              ? "bg-[#A9772F] text-white border-[#A9772F] shadow-sm" 
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
          }`}
        >
          {voiceMode ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span>{voiceMode ? "અવાજ ચાલુ (Voice On)" : "અવાજ બંધ (Voice Off)"}</span>
        </button>
      </div>

      {/* Sound wave visualizer when recording */}
      {isListening && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50/60 rounded border border-red-200 justify-center text-xs text-[#8B2E2E] font-guj-body font-medium animate-pulse">
          <span className="w-2 h-2 rounded-full bg-[#8B2E2E] animate-ping"></span>
          <span>હું સાંભળી રહ્યો છું, બોલો... (Listening)</span>
        </div>
      )}

      {/* Main Form with Microphone integration */}
      <form onSubmit={handleSendCommand} className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={isListening ? "હું સાંભળી રહ્યો છું, બોલો..." : "દા.ત. Kaushik ko 5000 upad diya"}
            className={`w-full px-3 py-2 bg-white rounded border text-sm focus:outline-none focus:ring-1 font-guj-body pr-10 transition-all ${
              isListening 
                ? "border-[#8B2E2E] bg-red-50/30 text-red-900 placeholder-red-400 focus:ring-[#8B2E2E]" 
                : "border-[#A9772F] focus:ring-[#A9772F]"
            }`}
            disabled={loading}
          />
          <button 
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-[#A9772F]"
          >
            <CornerDownLeft className="w-4 h-4" />
          </button>
        </div>

        {speechSupported && (
          <button
            type="button"
            onClick={isListening ? stopSpeechRecognition : startSpeechRecognition}
            disabled={loading}
            className={`px-3.5 py-2 rounded text-sm font-bold flex items-center gap-1.5 transition-all border flex-shrink-0 ${
              isListening 
                ? "bg-[#8B2E2E] border-[#8B2E2E] text-white hover:bg-[#701e1e]" 
                : "bg-white border-[#A9772F] text-[#A9772F] hover:bg-[#FAF5EB]"
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-4 h-4" />
                <span>બંધ કરો</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>બોલો</span>
              </>
            )}
          </button>
        )}

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

      {/* 1. Query Result Panel with Voice repetition */}
      {queryResult && (
        <div className="bg-emerald-50 border-l-4 border-[#2F5D42] p-3 rounded-r text-sm text-ledger-ink font-guj-body mb-2 shadow-sm animate-fade-in flex justify-between items-start gap-3">
          <div className="flex-1">
            <div className="font-bold text-xs text-[#2F5D42] uppercase tracking-wider mb-1">
              🤖 જીની નો જવાબ (Gemini Query Result):
            </div>
            <p className="text-sm font-medium leading-relaxed">{queryResult}</p>
          </div>
          <button
            type="button"
            onClick={() => speakText(queryResult)}
            className="p-1.5 hover:bg-[#2F5D42]/10 text-[#2F5D42] rounded-full transition-colors flex-shrink-0 mt-0.5"
            title="જવાબ ફરીથી સાંભળો"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Clarify / Helper Panel */}
      {clarifyResult && (
        <div className="bg-amber-50 border-l-4 border-[#A9772F] p-3 rounded-r text-sm text-ledger-ink font-guj-body mb-2 shadow-sm flex justify-between items-start gap-3">
          <div className="flex-1">
            <div className="font-bold text-xs text-[#A9772F] uppercase tracking-wider mb-1 flex items-center gap-1">
              <HelpCircle className="w-4 h-4" /> વધુ સ્પષ્ટતા જરૂરી છે:
            </div>
            <p className="text-sm font-medium leading-relaxed">{clarifyResult}</p>
          </div>
          <button
            type="button"
            onClick={() => speakText(clarifyResult)}
            className="p-1.5 hover:bg-[#A9772F]/10 text-[#A9772F] rounded-full transition-colors flex-shrink-0 mt-0.5"
            title="ફરીથી સાંભળો"
          >
            <Volume2 className="w-4 h-4" />
          </button>
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
