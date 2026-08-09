export const TransactionType = {
  INCOME: "income",
  EXPENSE: "expense",
  SAVING: "saving",
} as const;
export type TransactionType =
  (typeof TransactionType)[keyof typeof TransactionType];

export const TransactionSource = {
  EMAIL: "email",
  MANUAL: "manual",
} as const;
export type TransactionSource =
  (typeof TransactionSource)[keyof typeof TransactionSource];

export const CategoryType = {
  INCOME: "income",
  EXPENSE: "expense",
  SAVING: "saving",
} as const;
export type CategoryType = (typeof CategoryType)[keyof typeof CategoryType];
