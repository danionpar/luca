"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
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

interface Category {
  id: string;
  name: string;
  emoji: string;
  type: "income" | "expense" | "saving";
  isSystem: boolean;
  isActive: boolean;
}

export default function CategoriesPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<{ name: string; emoji: string; type: "income" | "expense" | "saving" }>({ name: "", emoji: "", type: "expense" });

  const fetchCategories = useCallback(async () => {
    const res = await fetch(`${API}/api/categories`, { credentials: "include" });
    if (res.ok) {
      const { data } = await res.json();
      setCategories(data);
    }
  }, []);

  useEffect(() => {
    if (!isPending && !session) router.push("/login");
    if (session) fetchCategories();
  }, [isPending, session, router, fetchCategories]);

  async function handleSave() {
    const url = editing
      ? `${API}/api/categories/${editing.id}`
      : `${API}/api/categories`;
    const method = editing ? "PUT" : "POST";

    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(form),
    });

    setDialogOpen(false);
    setEditing(null);
    setForm({ name: "", emoji: "", type: "expense" });
    fetchCategories();
  }

  async function handleDelete(id: string) {
    await fetch(`${API}/api/categories/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchCategories();
  }

  async function handleToggle(id: string) {
    await fetch(`${API}/api/categories/${id}/toggle`, {
      method: "PATCH",
      credentials: "include",
    });
    fetchCategories();
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setForm({ name: cat.name, emoji: cat.emoji, type: cat.type });
    setDialogOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", emoji: "", type: "expense" });
    setDialogOpen(true);
  }

  if (isPending) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  if (!session) return null;

  const grouped = {
    expense: categories.filter((c) => c.type === "expense"),
    income: categories.filter((c) => c.type === "income"),
    saving: categories.filter((c) => c.type === "saving"),
  };

  const typeLabels = { expense: "Gastos", income: "Ingresos", saving: "Ahorros" };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Categorías</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={openCreate}>+ Agregar</Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar categoría" : "Nueva categoría"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="space-y-2 w-20">
                  <Label>Emoji</Label>
                  <Input
                    value={form.emoji}
                    onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                    placeholder="🏷️"
                    maxLength={4}
                  />
                </div>
                <div className="space-y-2 flex-1">
                  <Label>Nombre</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nombre de la categoría"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as "income" | "expense" | "saving" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Gasto</SelectItem>
                    <SelectItem value="income">Ingreso</SelectItem>
                    <SelectItem value="saving">Ahorro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave} className="w-full" disabled={!form.name || !form.emoji}>
                {editing ? "Guardar" : "Crear"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(["expense", "income", "saving"] as const).map((type) => (
        <div key={type} className="mb-6">
          <h3 className="text-lg font-semibold mb-3">
            {typeLabels[type]}
          </h3>
          <div className="grid gap-2">
            {grouped[type].map((cat) => (
              <Card key={cat.id} className={!cat.isActive ? "opacity-50" : ""}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cat.emoji}</span>
                    <span className="font-medium">{cat.name}</span>
                    {cat.isSystem && (
                      <Badge variant="secondary" className="text-xs">
                        Sistema
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {cat.isSystem ? (
                      <Switch
                        checked={cat.isActive}
                        onCheckedChange={() => handleToggle(cat.id)}
                      />
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(cat)}
                        >
                          ✏️
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(cat.id)}
                        >
                          🗑️
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </AppLayout>
  );
}
