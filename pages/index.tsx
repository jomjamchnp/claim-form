import React, { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ScanIcon,
  SparklesIcon,
  XIcon,
  CheckIcon,
  RotateCcwIcon,
  CameraIcon,
  ImageIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Separator } from "@/components/ui/separator";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScanResult {
  carrier: "spx" | "flash" | "";
  supplier_name: string;
  date: string;
  name: string;
  car_no: string;
  phone: string;
  barcode: string;
  route: string;
  vehicle_type: string;
  standby_round: string;
}


type AutofilledKeys = Set<keyof FormValues>;

// ─── Zod Schema ─────────────────────────────────────────────────────────────

const formSchema = z.object({
  date: z.date().refine((d) => !!d, "กรุณาเลือกวันที่"),
  name: z.string().min(1, "กรุณากรอกชื่อ"),
  car_no: z.string().min(1, "กรุณากรอกทะเบียนรถ"),
  phone: z.string().min(1, "กรุณากรอกเบอร์โทร"),
  barcode: z.string().min(1, "กรุณากรอกเลขบาร์"),
  route: z.string().min(1, "กรุณากรอกเส้นทาง"),
  vehicle_type: z.string().min(1, "กรุณากรอกประเภทรถ"),
  standby_round: z.string().min(1, "กรุณากรอกรอบเวลา"),
  standby_time: z.string().min(1, "กรุณาเลือกเวลาสแตนบาย"),
  depart_time: z.string().min(1, "กรุณาเลือกเวลาออกเดินทาง"),
  remark: z.string().optional(),
  trip_fee: z.string().min(1, "กรุณากรอกค่าเที่ยว"),
  bank: z.string().min(1, "กรุณาเลือกธนาคาร"),
  account_name: z.string().min(1, "กรุณากรอกชื่อบัญชี"),
  account_number: z.string().min(1, "กรุณากรอกเลขบัญชี"),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Image resize helper ─────────────────────────────────────────────────────

function resizeImage(file: File, maxDim = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        c.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// SPX QR = the value directly; Flash QR = a URL like ".../go/KKC1PR6U72" → take
// the last path segment.
function normalizeQr(raw: string | undefined | null): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v))
    return v.split("/").filter(Boolean).pop() ?? null;
  return v;
}

// Decode the barcode from the QR code using zxing-wasm (zxing-cpp port) — the
// strongest JS decoder, and used on every device so results are identical across
// desktop Chrome, iOS Safari and the LINE in-app WebView. Dynamically imported so
// it never runs during SSR. null if not found.
async function decodeQrFromFile(file: File): Promise<string | null> {
  try {
    const { readBarcodes } = await import("zxing-wasm/reader");
    const results = await readBarcodes(file, {
      tryHarder: true,
      tryDownscale: true,
      formats: ["QRCode"],
      maxNumberOfSymbols: 1,
    });
    return normalizeQr(results[0]?.text);
  } catch {
    return null;
  }
}

// ─── Autofilled Field wrapper ────────────────────────────────────────────────

function AutofilledBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-teal border border-brand-teal/60 bg-white rounded-full px-2 py-0.5">
      <SparklesIcon className="h-2.5 w-2.5" />
      สแกน
    </span>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 !mt-6">
      <span className="text-xs font-semibold text-brand-sub uppercase tracking-wider whitespace-nowrap">
        {children}
      </span>
      <Separator className="flex-1" />
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function V2() {
  const [scanToken, setScanToken] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [scanPhase, setScanPhase] = useState<"idle" | "scanning" | "review">(
    "idle",
  );
  const [scanImage, setScanImage] = useState<string | null>(null);
  const [scanDraft, setScanDraft] = useState<ScanResult | null>(null);
  const [autofilled, setAutofilled] = useState<AutofilledKeys>(new Set());
  const [confirmedScanImage, setConfirmedScanImage] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierMismatch, setSupplierMismatch] = useState<{
    found: string;
    expected: string;
    label: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [showImageSourceDialog, setShowImageSourceDialog] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      name: "",
      car_no: "",
      phone: "",
      barcode: "",
      route: "",
      vehicle_type: "",
      standby_round: "",
      standby_time: "",
      depart_time: "",
      remark: "",
      trip_fee: "",
      bank: "",
      account_name: "",
      account_number: "",
    },
  });

  const tripFee = form.watch("trip_fee");
  const oilClaim = tripFee
    ? (parseFloat(tripFee.replace(/,/g, "")) * 0.5).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "";

  // ── Password ────────────────────────────────────────────────────────────

  const handlePasswordCheck = async () => {
    setPasswordLoading(true);
    try {
      const res = await fetch("/api/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json();
      if (data.valid) {
        setScanToken(data.token ?? null);
      } else {
        toast.error("รหัสผิด ลองใหม่อีกครั้ง");
        setPasswordInput("");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    }
    setPasswordLoading(false);
  };

  // ── Scan ─────────────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("รูปใหญ่เกินไป (สูงสุด 5MB)");
      return;
    }

    let dataUrl: string;
    try {
      dataUrl = await resizeImage(file);
    } catch {
      toast.error("เปิดรูปไม่ได้ ลองใหม่อีกครั้ง");
      return;
    }

    const base64Size = dataUrl.split(",")[1].length * 0.75;
    if (base64Size > 2 * 1024 * 1024) {
      toast.error("รูปยังใหญ่เกิน ลองถ่ายใหม่");
      return;
    }

    setScanImage(dataUrl);
    setScanPhase("scanning");

    // Decode QR at full resolution client-side (server only gets the 1280px image)
    const qrBarcode = await decodeQrFromFile(file);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-scan-token": scanToken ?? "",
        },
        body: JSON.stringify({
          image: dataUrl.split(",")[1],
          barcode: qrBarcode ?? undefined,
        }),
      });

      if (res.status === 429) {
        const data = await res.json();
        toast.error(data.error ?? "สแกนเกินจำนวน รอสักครู่");
        setScanPhase("idle");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "อ่านรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
        setScanPhase("idle");
        return;
      }

      const result: ScanResult = await res.json();
      setScanDraft(result);
      setScanPhase("review");
    } catch {
      toast.error("อ่านรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
      setScanPhase("idle");
    }
  };

  const confirmScanFill = () => {
    if (!scanDraft) return;
    const newAutofilled = new Set<keyof FormValues>();

    if (scanDraft.date) {
      const [d, m, y] = scanDraft.date.split("/").map(Number);
      const parsed = new Date(y, m - 1, d);
      if (!isNaN(parsed.getTime())) {
        form.setValue("date", parsed);
        newAutofilled.add("date");
      }
    }
    (
      ["name", "car_no", "phone", "barcode", "route", "vehicle_type"] as const
    ).forEach((k) => {
      const v = scanDraft[k as keyof ScanResult];
      if (v) {
        form.setValue(k, v);
        newAutofilled.add(k);
      }
    });

    if (scanDraft.standby_round) {
      // supports "DD/MM/YYYY HH:MM" or "HH:MM"
      const parts = scanDraft.standby_round.trim().split(" ");
      if (parts.length === 2) {
        const [datePart, timePart] = parts;
        const [d, m, y] = datePart.split("/").map(Number);
        const parsed = new Date(y, m - 1, d);
        if (!isNaN(parsed.getTime())) {
          form.setValue("date", parsed);
          newAutofilled.add("date");
        }
        form.setValue("standby_round", timePart);
      } else {
        form.setValue("standby_round", scanDraft.standby_round);
      }
      newAutofilled.add("standby_round");
    }

    setConfirmedScanImage(scanImage);
    setSupplierName(scanDraft.supplier_name ?? "");
    setAutofilled(newAutofilled);
    setScanPhase("idle");
    setScanImage(null);
    setScanDraft(null);
    toast.success(`เติมข้อมูลจากใบงานแล้ว · ${newAutofilled.size} ช่อง`);
  };

  const handleFieldChange = (k: keyof FormValues) => {
    setAutofilled((prev) => {
      if (!prev.has(k)) return prev;
      const n = new Set(prev);
      n.delete(k);
      return n;
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const tripFeeNum = parseFloat(values.trip_fee.replace(/,/g, "")) || 0;
    const oilClaimFormatted = (tripFeeNum * 0.5).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const payload: Record<string, unknown> = {
      ...values,
      date: format(values.date, "dd/MM/yyyy"),
      trip_fee: tripFeeNum.toLocaleString(),
      oil_claim: oilClaimFormatted,
      supplier_name: supplierName,
    };
    if (confirmedScanImage) {
      payload.image = confirmedScanImage.split(",")[1];
    }

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("ส่งฟอร์มแจ้งเบิกน้ำมันแล้ว ✓");
        form.reset({ date: new Date() });
        setAutofilled(new Set());
        setConfirmedScanImage(null);
        setSupplierName("");
      } else {
        toast.error("เกิดข้อผิดพลาดในการส่งข้อมูล");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาดในการส่งข้อมูล");
    }
    setIsSubmitting(false);
  };

  const isUnlocked = scanToken !== null;

  return (
    <div className="min-h-screen bg-white">
      <Dialog open={!isUnlocked}>
        <DialogContent
          className="sm:max-w-sm"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>กรุณากรอกรหัสผ่าน</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Input
              type="password"
              placeholder="รหัสผ่าน"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordCheck()}
              autoFocus
            />
            <Button
              onClick={handlePasswordCheck}
              disabled={passwordLoading || !passwordInput}
              className="bg-brand-blue hover:bg-brand-navy text-white"
            >
              {passwordLoading ? "กำลังตรวจสอบ..." : "ตรวจสอบ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Supplier mismatch warning */}
      <Dialog
        open={!!supplierMismatch}
        onOpenChange={() => setSupplierMismatch(null)}
      >
        <DialogContent
          className="sm:max-w-sm"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-brand-danger">
              ใบงานไม่ตรงกับบริษัทเรา
            </DialogTitle>
          </DialogHeader>
          {supplierMismatch && (
            <div className="flex flex-col gap-4 pt-1">
              <p className="text-sm text-brand-ink leading-relaxed">
                AI ตรวจพบ{" "}
                <span className="font-semibold">{supplierMismatch.label}</span>{" "}
                เป็น{" "}
                <span className="font-bold text-brand-danger">
                  &ldquo;{supplierMismatch.found}&rdquo;
                </span>{" "}
                แต่ต้องการ{" "}
                <span className="font-bold text-brand-ok">
                  &ldquo;{supplierMismatch.expected}&rdquo;
                </span>
              </p>
              <p className="text-xs text-brand-sub">
                กรุณาตรวจสอบรูปและสแกนใหม่ด้วยใบงานของบริษัทเรา
              </p>
              <Button
                className="w-full bg-brand-navy hover:bg-brand-blue text-white"
                onClick={() => setSupplierMismatch(null)}
              >
                ปิดและสแกนใหม่
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Scan review sheet */}
      {scanPhase === "review" && scanDraft && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => {
              setScanPhase("idle");
              setScanImage(null);
              setScanDraft(null);
            }}
          />
          <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[88vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mt-3 mb-2 shrink-0" />
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <h3 className="text-lg font-bold text-brand-ink">
                ตรวจสอบข้อมูลที่สแกนได้
              </h3>
              <button
                onClick={() => {
                  setScanPhase("idle");
                  setScanImage(null);
                  setScanDraft(null);
                }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <XIcon className="h-4 w-4 text-brand-sub" />
              </button>
            </div>

            {scanImage && (
              <div className="mx-5 mb-4 p-3 rounded-xl bg-brand-sky flex items-center gap-3 shrink-0">
                <img
                  src={scanImage}
                  alt="scan"
                  className="w-12 h-12 rounded-lg object-cover object-top border border-brand-line shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {scanDraft.carrier === "spx" && (
                      <span className="inline-flex items-center text-[10px] font-black text-white bg-[#e8380d] px-2 py-0.5 rounded">
                        SPX
                      </span>
                    )}
                    {scanDraft.carrier === "flash" && (
                      <span className="inline-flex items-center text-[10px] font-black text-[#1a1a1a] bg-[#f5a623] px-2 py-0.5 rounded">
                        FLASH
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-brand-teal text-xs font-semibold">
                    <SparklesIcon className="h-3 w-3" />
                    {(() => {
                      const { carrier: _, ...rest } = scanDraft;
                      return `ดึงข้อมูลได้ ${Object.values(rest).filter(Boolean).length}/${Object.keys(rest).length} ช่อง`;
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-y-auto flex-1 px-5">
              <p className="text-xs text-brand-sub mb-3">
                แตะแก้ไขค่าที่ไม่ถูกต้องได้ก่อนเติมลงฟอร์ม
              </p>
              <div className="flex flex-col gap-3 pb-4">
                {(Object.entries(scanDraft) as [keyof ScanResult, string][])
                  .filter(([k]) => k !== "carrier")
                  .map(([k, v]) => {
                    const labels: Record<keyof ScanResult, string> = {
                      carrier: "",
                      supplier_name: "🏢 ผู้ให้บริการ",
                      date: "📅 วันที่",
                      name: "🙋 ชื่อคนขับ",
                      car_no: "🚛 ทะเบียนรถ",
                      phone: "📞 เบอร์โทร",
                      barcode: "📦 เลขบาร์",
                      route: "📍 เส้นทาง",
                      vehicle_type: "🚚 ประเภทรถ",
                      standby_round: "⏰ รอบเวลาสแตนบาย",
                    };
                    const isLocked = k === "supplier_name";
                    const empty = !v;
                    return (
                      <div
                        key={k}
                        className={cn(
                          "rounded-xl border px-3 py-2",
                          empty
                            ? "border-gray-200 bg-white"
                            : isLocked
                              ? "border-brand-ok/50 bg-green-50/60"
                              : "border-brand-teal/50 bg-brand-sky/50",
                        )}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[11px] font-semibold text-brand-sub">
                            {labels[k]}
                          </label>
                          {empty ? (
                            <span className="text-[10px] bg-gray-100 text-brand-sub px-2 py-0.5 rounded-full">
                              ไม่พบ — กรอกเอง
                            </span>
                          ) : isLocked ? (
                            <span className="text-[10px] text-brand-ok font-semibold flex items-center gap-1">
                              <CheckIcon className="h-3 w-3" />
                              ยืนยันแล้ว
                            </span>
                          ) : (
                            <span className="text-[10px] text-brand-teal font-semibold flex items-center gap-1">
                              <CheckIcon className="h-3 w-3" />
                              พบ
                            </span>
                          )}
                        </div>
                        <input
                          value={scanDraft[k] || ""}
                          disabled={isLocked}
                          onChange={(e) =>
                            setScanDraft((d) =>
                              d ? { ...d, [k]: e.target.value } : d,
                            )
                          }
                          placeholder="—"
                          className={cn(
                            "w-full bg-transparent outline-none text-[15px] font-medium py-0.5",
                            isLocked
                              ? "text-brand-ok cursor-default"
                              : "text-brand-ink",
                          )}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="flex gap-2.5 px-5 py-4 border-t bg-white shrink-0">
              <Button
                variant="outline"
                className="border-brand-line text-brand-navy font-semibold"
                onClick={() => {
                  setScanPhase("idle");
                  setScanImage(null);
                  setScanDraft(null);
                  setShowImageSourceDialog(true);
                }}
              >
                <RotateCcwIcon className="h-4 w-4 mr-1.5" />
                สแกนใหม่
              </Button>
              <Button
                className="flex-1 bg-brand-navy hover:bg-brand-blue text-white font-bold"
                onClick={confirmScanFill}
              >
                <CheckIcon className="h-4 w-4 mr-1.5" />
                เติมลงฟอร์ม
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Scanning overlay */}
      {scanPhase === "scanning" && (
        <div className="fixed inset-0 z-40 bg-black/90 flex flex-col items-center justify-center px-7">
          {scanImage && (
            <div className="relative w-56 max-w-[80%] rounded-2xl overflow-hidden shadow-2xl mb-7">
              <img
                src={scanImage}
                alt="scanning"
                className="w-full block max-h-72 object-cover object-top"
              />
              <div className="absolute inset-0 border-2 border-brand-teal/80 rounded-2xl pointer-events-none" />
              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-teal to-transparent shadow-[0_0_14px_3px_rgba(35,167,199,.7)] animate-scan-line" />
            </div>
          )}
          <div className="flex items-center gap-2.5 text-white">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-brand-teal animate-spin" />
            <span className="text-[15px] font-medium">
              AI กำลังอ่านใบงาน...
            </span>
          </div>
          <p className="text-white/50 text-xs mt-2">กรุณารอสักครู่</p>
        </div>
      )}
      {/* Main form */}
      <div className="max-w-lg mx-auto px-5 py-8 pb-16">
        {/* Header */}
        <div className="flex justify-center mb-6">
          <img
            src="https://www.dropbox.com/scl/fi/vh73i9yg9zgx0kicb9vrj/logo.jpg?rlkey=o20qqqr3bml6m52y5rxo9m272&st=tbtvqrni&raw=1"
            className="max-w-[110px]"
            alt="logo"
          />
        </div>
        <h1 className="text-2xl font-bold text-brand-ink tracking-tight mb-6">
          ฟอร์มแจ้งเบิกน้ำมัน
        </h1>

        {/* Scan CTA */}
        <button
          type="button"
          onClick={() => setShowImageSourceDialog(true)}
          className="w-full text-left bg-brand-navy rounded-2xl px-5 py-4 mb-6 flex items-center gap-4 shadow-[0_8px_22px_rgba(21,57,90,.28)] active:opacity-90 transition-opacity"
        >
          <span className="w-12 h-12 rounded-xl bg-brand-teal flex items-center justify-center shrink-0">
            <ScanIcon className="h-6 w-6 text-white" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-[17px] font-bold text-white">
                สแกนใบงาน
              </span>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-brand-navy bg-yellow-300 px-2 py-0.5 rounded-full">
                <SparklesIcon className="h-2.5 w-2.5" />
                AI
              </span>
            </span>
            <span className="block text-[13px] text-white/80 mt-1">
              ถ่ายรูปแล้วเติมข้อมูลอัตโนมัติ
            </span>
          </span>
        </button>
        {/* Camera input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        {/* Gallery input */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {/* Image source picker — bottom sheet */}
        <Drawer open={showImageSourceDialog} onOpenChange={setShowImageSourceDialog}>
          <DrawerContent>
            <div className="px-5 pb-6 pt-2">
              <DrawerHeader className="px-0">
                <DrawerTitle className="text-left text-lg font-bold">สแกนใบงาน</DrawerTitle>
                <DrawerDescription className="text-left">เลือกวิธีนำเข้ารูปใบงาน</DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col gap-3 mt-2">
                <button
                  type="button"
                  className="flex items-center gap-4 rounded-xl border border-input px-4 py-4 text-base font-semibold hover:bg-accent active:bg-accent transition-colors"
                  onClick={() => {
                    setShowImageSourceDialog(false);
                    setTimeout(() => fileInputRef.current?.click(), 400);
                  }}
                >
                  <span className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <CameraIcon className="h-5 w-5 text-muted-foreground" />
                  </span>
                  ถ่ายรูป
                </button>
                <button
                  type="button"
                  className="flex items-center gap-4 rounded-xl border border-input px-4 py-4 text-base font-semibold hover:bg-accent active:bg-accent transition-colors"
                  onClick={() => {
                    setShowImageSourceDialog(false);
                    setTimeout(() => galleryInputRef.current?.click(), 400);
                  }}
                >
                  <span className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </span>
                  เลือกจากแกลเลอรี่
                </button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>

        <div className="flex items-center gap-3 mb-6">
          <span className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-brand-sub">หรือกรอกเอง</span>
          <span className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Section 1: Scan-able */}
            <SectionHeader>ข้อมูลการเดินทาง</SectionHeader>

            {/* Date */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-brand-sub text-sm">
                      เลือกวันที่ 📅 <span className="text-red-500">*</span>
                    </FormLabel>
                    {autofilled.has("date") && <AutofilledBadge />}
                  </div>
                  <FormControl>
                    <DatePicker
                      value={field.value}
                      onChange={(d) => {
                        field.onChange(d);
                        handleFieldChange("date");
                      }}
                      className={cn(
                        autofilled.has("date") &&
                          "border-brand-teal bg-brand-sky border-2",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-brand-sub text-sm">
                      ชื่อ 🙋 <span className="text-red-500">*</span>
                    </FormLabel>
                    {autofilled.has("name") && <AutofilledBadge />}
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange("name");
                      }}
                      className={cn(
                        "h-12",
                        autofilled.has("name") &&
                          "border-brand-teal bg-brand-sky border-2",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Supplier name — display only, disabled */}
            <div className="mb-5">
              <label className="text-brand-sub text-sm font-medium block mb-2">
                ผู้ให้บริการ 🏢
              </label>
              <div
                className={cn(
                  "h-12 rounded-md border px-3 flex items-center text-sm",
                  supplierName
                    ? "border-brand-ok/50 bg-green-50/60 text-brand-ok font-semibold"
                    : "border-input bg-muted/50 text-muted-foreground",
                )}
              >
                {supplierName || "—"}
              </div>
            </div>

            {/* Car no */}
            <FormField
              control={form.control}
              name="car_no"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-brand-sub text-sm">
                      ทะเบียนรถ 🚛 <span className="text-red-500">*</span>
                    </FormLabel>
                    {autofilled.has("car_no") && <AutofilledBadge />}
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange("car_no");
                      }}
                      className={cn(
                        "h-12",
                        autofilled.has("car_no") &&
                          "border-brand-teal bg-brand-sky border-2",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-brand-sub text-sm">
                      เบอร์โทร 📞 <span className="text-red-500">*</span>
                    </FormLabel>
                    {autofilled.has("phone") && <AutofilledBadge />}
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="tel"
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange("phone");
                      }}
                      className={cn(
                        "h-12",
                        autofilled.has("phone") &&
                          "border-brand-teal bg-brand-sky border-2",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Barcode */}
            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-brand-sub text-sm">
                      เลขบาร์ 📦 <span className="text-red-500">*</span>
                    </FormLabel>
                    {autofilled.has("barcode") && <AutofilledBadge />}
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange("barcode");
                      }}
                      className={cn(
                        "h-12",
                        autofilled.has("barcode") &&
                          "border-brand-teal bg-brand-sky border-2",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Route */}
            <FormField
              control={form.control}
              name="route"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-brand-sub text-sm">
                      เส้นทาง 📍 <span className="text-red-500">*</span>
                    </FormLabel>
                    {autofilled.has("route") && <AutofilledBadge />}
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange("route");
                      }}
                      className={cn(
                        "h-12",
                        autofilled.has("route") &&
                          "border-brand-teal bg-brand-sky border-2",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Vehicle type */}
            <FormField
              control={form.control}
              name="vehicle_type"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-brand-sub text-sm">
                      ประเภทรถ 🚚 <span className="text-red-500">*</span>
                    </FormLabel>
                    {autofilled.has("vehicle_type") && <AutofilledBadge />}
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange("vehicle_type");
                      }}
                      className={cn(
                        "h-12",
                        autofilled.has("vehicle_type") &&
                          "border-brand-teal bg-brand-sky border-2",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Standby round */}
            <FormField
              control={form.control}
              name="standby_round"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <FormLabel className="text-brand-sub text-sm">
                    รอบเวลาสแตนบาย ⏰ <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} className="h-12" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Standby time */}
            <FormField
              control={form.control}
              name="standby_time"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-brand-sub text-sm">
                      เวลาสแตนบาย <span className="text-red-500">*</span>
                    </FormLabel>
                    {autofilled.has("standby_time") && <AutofilledBadge />}
                  </div>
                  <FormControl>
                    <TimePicker
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        handleFieldChange("standby_time");
                      }}
                      placeholder="เลือกเวลาสแตนบาย"
                      className={cn(
                        autofilled.has("standby_time") &&
                          "border-brand-teal bg-brand-sky border-2",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Depart time */}
            <FormField
              control={form.control}
              name="depart_time"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <FormLabel className="text-brand-sub text-sm">
                    ออกเดินทาง <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <TimePicker
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="เลือกเวลาออกเดินทาง"
                      className="h-12"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Remark */}
            <FormField
              control={form.control}
              name="remark"
              render={({ field }) => (
                <FormItem className="mb-6">
                  <FormLabel className="text-brand-sub text-sm">
                    หมายเหตุ
                  </FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} className="resize-none" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Section 2: Financial */}
            <SectionHeader>ค่าเที่ยวและน้ำมัน</SectionHeader>

            <FormField
              control={form.control}
              name="trip_fee"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <FormLabel className="text-brand-sub text-sm">
                    ค่าเที่ยว (บาท) <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="numeric"
                      className="h-12"
                      value={
                        field.value
                          ? parseInt(
                              field.value.replace(/,/g, ""),
                            ).toLocaleString()
                          : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        field.onChange(raw);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="mb-6">
              <label className="text-brand-sub text-sm font-medium block mb-2">
                เบิกน้ำมัน (บาท)
              </label>
              <div className="h-12 rounded-md border border-input bg-muted/50 px-3 flex items-center text-sm text-muted-foreground">
                {oilClaim || "—"}
              </div>
            </div>

            {/* Section 3: Bank */}
            <SectionHeader>ข้อมูลบัญชีธนาคาร</SectionHeader>

            <FormField
              control={form.control}
              name="bank"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <FormLabel className="text-brand-sub text-sm">
                    บัญชีธนาคาร 🏦 <span className="text-red-500">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="เลือกธนาคาร" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[
                        "กรุงไทย",
                        "กสิกรไทย",
                        "ไทยพาณิชย์",
                        "กรุงเทพ",
                        "กรุงศรี",
                        "อาคารสงเคราะห์",
                        "ทหารไทยธนชาต (TTB)",
                        "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร(ธ.ก.ส.)",
                        "ออมสิน",
                        "เกียรตินาคิน",
                        "ซีไอเอ็มบี",
                        "ยูโอบี",
                      ].map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="account_name"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <FormLabel className="text-brand-sub text-sm">
                    ชื่อบัญชี <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} className="h-12" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="account_number"
              render={({ field }) => (
                <FormItem className="mb-8">
                  <FormLabel className="text-brand-sub text-sm">
                    เลขบัญชี <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="numeric"
                      className="h-12"
                      onChange={(e) =>
                        field.onChange(e.target.value.replace(/[^0-9]/g, ""))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-14 text-base font-bold bg-brand-blue hover:bg-brand-navy text-white rounded-xl shadow-[0_6px_16px_rgba(31,111,178,.3)]"
            >
              {isSubmitting ? "กำลังส่ง..." : "ส่งฟอร์ม"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
