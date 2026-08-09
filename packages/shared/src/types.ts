import type {
  CategoryType,
  TransactionSource,
  TransactionType,
} from "./enums.js";

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  userId: string | null;
  parentId: string | null;
  name: string;
  emoji: string;
  type: CategoryType;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: number;
  merchant: string | null;
  description: string | null;
  transactionDate: string;
  source: TransactionSource;
  bank: string | null;
  paymentMethod: string | null;
  rawEmailUid: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategorizationRule {
  id: string;
  userId: string;
  categoryId: string;
  merchantPattern: string;
  timesUsed: number;
  createdAt: string;
  updatedAt: string;
}
