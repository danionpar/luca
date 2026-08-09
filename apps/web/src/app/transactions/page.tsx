"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Transaction {
  id: string;
  type: "income" | "expense" | "saving";
  amount: number;
  merchant: string | null;
  description: string | null;
  transactionDate: string;
  categoryId: string | null;
  isProjected: boolean;
  billingMonth: string | null;
}

interface Category {
  id: string;
  name: string;
  emoji: string;
  type: "income" | "expense" | "saving";
}

interface Summary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  totalProjected: number;
  available: number;
}

function formatCLP(amount: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

const emptyForm = {
  type: "expense" as "income" | "expense" | "saving",
  amount: "",
  categoryId: "",
  merchant: "",
  description: "",
  transactionDate: new Date().toISOString().split("T")[0],
};

export default function TransactionsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIncome: 0, totalExpenses: 0, totalSavings: 0, totalProjected: 0, available: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState<"all" | "income" | "expense" | "saving">("all");

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const fetchData = useCallback(async () => {
    const [txRes, catRes, sumRes] = await Promise.all([
      fetch(`${API}/api/transactions?month=${month}&year=${year}`, { credentials: "include" }),
      fetch(`${API}/api/categories`, { credentials: "include" }),
      fetch(`${API}/api/transactions/summary?month=${month}&year=${year}`, { credentials: "include" }),
    ]);
    if (txRes.ok) setTransactions((await txRes.json()).data);
    if (catRes.ok) setCategories((await catRes.json()).data);
    if (sumRes.ok) setSummary((await sumRes.json()).data);
  }, [month, year]);

  useEffect(() => {
    if (!isPending && !session) router.push("/login");
    if (session) fetchData();
  }, [isPending, session, router, fetchData]);

  async function handleSave() {
    await fetch(`${API}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...form,
        amount: parseInt(form.amount, 10),
        categoryId: form.categoryId || undefined,
        merchant: form.merchant || undefined,
        description: form.description || undefined,
      }),
    });
    setDialogOpen(false);
    setForm(emptyForm);
    fetchData();
  }

  async function handleDelete(id: string) {
    await fetch(`${API}/api/transactions/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchData();
  }

  if (isPending) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  if (!session) return null;

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const filtered = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);

  const typeColors = { income: "text-green-600", expense: "text-red-600", saving: "text-blue-600" };
  const typeLabels = { income: "Ingreso", expense: "Gasto", saving: "Ahorro" };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Transacciones</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => {
              if (month === 1) { setMonth(12); setYear(year - 1); }
              else setMonth(month - 1);
            }}>←</Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {new Date(year, month - 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" })}
            </span>
            <Button variant="ghost" size="sm" onClick={() => {
              if (month === 12) { setMonth(1); setYear(year + 1); }
              else setMonth(month + 1);
            }}>→</Button>
          </div>
        </div>
        <Button onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
          + Agregar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-5 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ingresos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-600">{formatCLP(summary.totalIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Gastos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-red-600">{formatCLP(summary.totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Comprometido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-amber-600">{formatCLP(summary.totalProjected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ahorros</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-blue-600">{formatCLP(summary.totalSavings)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Disponible</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-xl font-bold ${summary.available >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCLP(summary.available)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(["all", "income", "expense", "saving"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Todos" : typeLabels[f]}
          </Button>
        ))}
      </div>

      {/* Transaction list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            No hay transacciones este mes
          </p>
        )}
        {filtered.map((tx) => {
          const cat = tx.categoryId ? catMap[tx.categoryId] : null;
          return (
            <Card key={tx.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl">{cat?.emoji || "💸"}</span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {tx.merchant || tx.description || cat?.name || "Sin descripción"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tx.transactionDate}
                      {cat && ` · ${cat.name}`}
                    </p>
                  </div>
                </div>
                  <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className={`font-bold ${typeColors[tx.type]}`}>
                      {tx.type === "expense" ? "-" : "+"}{formatCLP(tx.amount)}
                    </p>
                    <div className="flex gap-1 justify-end">
                      {tx.isProjected && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                          Proyectado
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {typeLabels[tx.type]}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(tx.id)}>
                    🗑️
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva transacción</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "income" | "expense" | "saving", categoryId: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Ingreso</SelectItem>
                  <SelectItem value="expense">Gasto</SelectItem>
                  <SelectItem value="saving">Ahorro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monto (CLP)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="150000"
              />
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v ?? "" })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((c) => c.type === form.type)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.emoji} {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comercio / Descripción</Label>
              <Input
                value={form.merchant}
                onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                placeholder="Ej: Líder, Uber, Sueldo mayo"
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={form.transactionDate}
                onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
              />
            </div>
            <Separator />
            <Button onClick={handleSave} className="w-full" disabled={!form.amount || parseInt(form.amount) <= 0}>
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
