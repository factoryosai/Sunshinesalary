/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Employee } from "../types";
import { Calendar, UserCheck, AlertCircle, Save, CheckCircle2 } from "lucide-react";

interface AttendanceViewProps {
  employees: Employee[];
  selectedYearMonth: string; // "YYYY_MM", e.g. "2026_07"
  onAttendanceUpdated: () => void;
}

export default function AttendanceView({
  employees,
  selectedYearMonth,
  onAttendanceUpdated,
}: AttendanceViewProps) {
  const [year, monthStr] = selectedYearMonth.split("_");
  const monthNum = parseInt(monthStr, 10);
  const yearNum = parseInt(year, 10);

  // Get total days in month
  const totalDays = new Date(yearNum, monthNum, 0).getDate();

  // State
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [attendanceData, setAttendanceData] = useState<{ [employeeId: string]: 'P' | 'A' | 'H' }>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>("");

  const selectedDateStr = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
  const attendanceDocId = `${yearNum}_${String(monthNum).padStart(2, "0")}_${String(selectedDay).padStart(2, "0")}`;

  // Fetch attendance on date or employee list change
  useEffect(() => {
    async function fetchAttendance() {
      setLoading(true);
      try {
        const attRef = doc(db, "attendance", attendanceDocId);
        const attSnap = await getDoc(attRef);
        if (attSnap.exists()) {
          setAttendanceData(attSnap.data().presents || {});
        } else {
          // Default all to Present 'P'
          const defaultAtt: { [employeeId: string]: 'P' | 'A' | 'H' } = {};
          employees.forEach(emp => {
            defaultAtt[emp.id] = 'P';
          });
          setAttendanceData(defaultAtt);
        }
      } catch (err) {
        console.error("Error fetching attendance:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAttendance();
  }, [attendanceDocId, employees]);

  // Set individual status
  const handleStatusChange = (employeeId: string, status: 'P' | 'A' | 'H') => {
    setAttendanceData(prev => ({
      ...prev,
      [employeeId]: status
    }));
  };

  // Save attendance for the selected date and update employee dutyDays
  const handleSaveAttendance = async () => {
    setLoading(true);
    setSuccessMsg("");
    try {
      // 1. Save date document
      const attRef = doc(db, "attendance", attendanceDocId);
      await setDoc(attRef, {
        dateStr: selectedDateStr,
        presents: attendanceData,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Fetch all attendance documents for this selectedMonth in a single query
      const startStr = `${yearNum}-${String(monthNum).padStart(2, "0")}-01`;
      const endStr = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(totalDays).padStart(2, "0")}`;
      const q = query(collection(db, "attendance"), where("dateStr", ">=", startStr), where("dateStr", "<=", endStr));
      const querySnap = await getDocs(q);

      const attendanceByDay: { [day: number]: { [employeeId: string]: 'P' | 'A' | 'H' } } = {};
      querySnap.forEach((docSnap) => {
        const data = docSnap.data();
        const dStr = data.dateStr; // e.g. "2026-07-19"
        const dNum = parseInt(dStr.split("-")[2], 10);
        attendanceByDay[dNum] = data.presents || {};
      });

      // 3. Loop through each employee and calculate duty days for this selectedMonth in memory
      for (const emp of employees) {
        let dutyCount = 0;

        for (let d = 1; d <= totalDays; d++) {
          let status: 'P' | 'A' | 'H' = 'P'; // default present

          if (d === selectedDay) {
            status = attendanceData[emp.id] || 'P';
          } else {
            status = attendanceByDay[d]?.[emp.id] || 'P';
          }

          if (status === 'P') {
            dutyCount += 1;
          } else if (status === 'H') {
            dutyCount += 0.5;
          }
        }

        // Update the employee's monthly record with the newly calculated aggregated dutyDays
        const recordRef = doc(db, "employees", emp.id, "monthlyRecords", selectedYearMonth);
        await setDoc(recordRef, {
          dutyDays: dutyCount,
          updatedAt: serverTimestamp()
        }, { merge: true });

        // Trigger recalculate on server to propagate changes and carry forward
        await fetch("/api/recalculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: emp.id, yearMonth: selectedYearMonth })
        });
      }

      setSuccessMsg("હાજરી સફળતાપૂર્વક સાચવવામાં આવી છે અને પગાર ગણતરી અપડેટ થઈ ગઈ છે!");
      onAttendanceUpdated();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Error saving attendance:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#FAF5EB] rounded border-2 border-[#A9772F] p-4 text-ledger-ink">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#A9772F] pb-3 mb-4 gap-3">
        <div>
          <h3 className="text-lg font-bold font-guj-title flex items-center gap-2 text-ledger-ink">
            📅 હાજરી રજીસ્ટર (Attendance Entry)
          </h3>
          <p className="text-xs text-gray-600 font-guj-body">
            તારીખ મુજબ હાજરી પૂરો. હાજરી આપમેળે ડ્યુટી દિવસોની ગણતરી કરીને પગાર સાથે જોડાઈ જશે.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-[#A9772F]">
          <Calendar className="w-4 h-4 text-[#A9772F]" />
          <select 
            value={selectedDay} 
            onChange={(e) => setSelectedDay(parseInt(e.target.value, 10))}
            className="text-sm font-mono focus:outline-none cursor-pointer bg-transparent"
          >
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                તારીખ {String(d).padStart(2, "0")} ({monthNum}/{yearNum})
              </option>
            ))}
          </select>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 text-[#2F5D42] bg-emerald-50 border border-emerald-300 p-3 rounded text-sm mb-4 font-guj-body">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid Table of Employees */}
      <div className="space-y-2 border border-[#A9772F] rounded overflow-hidden">
        <div className="grid grid-cols-3 bg-[#A9772F] text-white p-2.5 text-xs font-bold font-guj-body tracking-wider">
          <div className="col-span-1">કર્મચારી નામ</div>
          <div className="col-span-2 text-right">હાજરી સ્થિતિ</div>
        </div>

        <div className="divide-y divide-[#e5d8bc] bg-white">
          {employees.map((emp) => {
            const currentStatus = attendanceData[emp.id] || 'P';
            return (
              <div key={emp.id} className="grid grid-cols-3 p-3 items-center hover:bg-[#FAF5EB] transition-colors">
                <div className="col-span-1">
                  <span className="font-bold text-sm block">{emp.name}</span>
                  <span className="text-xs font-mono text-gray-500">{emp.id}</span>
                </div>
                
                {/* Attendance Options buttons */}
                <div className="col-span-2 flex justify-end gap-1.5">
                  {/* Present (P) */}
                  <button
                    type="button"
                    onClick={() => handleStatusChange(emp.id, 'P')}
                    className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition-all border ${
                      currentStatus === 'P'
                        ? 'bg-[#2F5D42] text-white border-[#2F5D42] shadow-sm'
                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    હાજર (P)
                  </button>

                  {/* Half Day (H) */}
                  <button
                    type="button"
                    onClick={() => handleStatusChange(emp.id, 'H')}
                    className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition-all border ${
                      currentStatus === 'H'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    અડધો દિવસ (H)
                  </button>

                  {/* Absent (A) */}
                  <button
                    type="button"
                    onClick={() => handleStatusChange(emp.id, 'A')}
                    className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition-all border ${
                      currentStatus === 'A'
                        ? 'bg-[#8B2E2E] text-white border-[#8B2E2E] shadow-sm'
                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    ગેરહાજર (A)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSaveAttendance}
          disabled={loading}
          className="bg-[#2F5D42] hover:bg-[#20442E] text-white px-5 py-2 rounded text-sm font-bold font-guj-body flex items-center gap-2 shadow transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? "સાચવી રહ્યું છે..." : "હાજરી સાચવો અને ગણતરી કરો"}
        </button>
      </div>
    </div>
  );
}
