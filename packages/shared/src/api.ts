import type { CategoryType, TransactionSource, TransactionType } from "./enums.js";
import type { Category, Transaction } from "./types.js";

// Categories
export interface CreateCategoryRequest {
  name: string;
  emoji: string;
  type: CategoryType;
  parentId?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  emoji?: string;
  type?: CategoryType;
}

// Transactions
export interface CreateTransactionRequest {
  type: TransactionType;
  amount: number;
  categoryId?: string;
  merchant?: string;
  description?: string;
  transactionDate: string;
  source?: TransactionSource;
  bank?: string;
  paymentMethod?: string;
}

export interface UpdateTransactionRequest {
  type?: TransactionType;
  amount?: number;
  categoryId?: string | null;
  merchant?: string | null;
  description?: string | null;
  transactionDate?: string;
}

export interface TransactionFilters {
  month?: number;
  year?: number;
  type?: TransactionType;
  categoryId?: string;
}

export interface TransactionSummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  available: number;
  month: number;
  year: number;
}

// Generic API response
export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  code?: string;
}

export type CategoryResponse = Category;
export type TransactionResponse = Transaction;
