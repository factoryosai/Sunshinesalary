/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Employee {
  id: string; // Document ID (usually the EmployeeLoginId, e.g. "Kaushik")
  name: string;
  mobile: string;
  employeeLoginId: string;
  authUid: string;
  monthlySalary: number;
  createdAt: any; // Firestore Timestamp or ISO string
}

export interface MonthlyRecord {
  id: string; // Record ID formatted as "YYYY_MM", e.g. "2026_07"
  year: number;
  month: number;
  dutyDays: number;
  overtimeAmount: number;
  carryForwardIn: number;
  totalEarned: number;
  totalWithdrawals: number;
  finalSalary: number;
  carryForwardOut: number;
  updatedAt: any; // Firestore Timestamp or ISO string
}

export interface Withdrawal {
  id: string; // Document ID
  monthlyRecordId: string; // Reference to year_month (e.g., "2026_07")
  date: any; // Firestore Timestamp or ISO string
  amount: number;
  note: string;
  createdBy: string; // Admin uid
  createdAt: any; // Firestore Timestamp or ISO string
}

export interface AppNotification {
  id: string;
  employeeId: string; // Employee Login ID
  type: 'upad' | 'pagar' | 'general';
  title: string;
  message: string;
  amount?: number;
  isRead: boolean;
  createdAt: any; // Firestore Timestamp or ISO string
}

export interface UserProfile {
  uid: string;
  role: 'admin' | 'employee';
  employeeId?: string; // Nullable for admin
}

export interface AttendanceRecord {
  id: string; // "YYYY_MM_DD"
  dateStr: string; // "YYYY-MM-DD"
  presents: { [employeeId: string]: 'P' | 'A' | 'H' }; // P = Present, A = Absent, H = Half day
  updatedAt: any;
}
