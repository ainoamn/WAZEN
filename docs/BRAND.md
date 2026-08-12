# هوية وازن البصرية (Brand)

تاريخ الاعتماد: 12 أغسطس 2026  
المفهوم: **الاتزان الهندسي الرقمي** (Geometric Equilibrium)

## المعنى

- الحلقة **الكحلية** `#0F172A` = المال **الشخصي**
- الحلقة **الزمردية** `#10B981` = المال **المشترك** (منزل، جمعية، رحلة)
- **النواة البيضاء** في الوسط = نظام وازن الذي يحفظ التوازن والفصل بين الحقوق

## الملفات

| الملف | الاستخدام |
|-------|-----------|
| `app/wazen-mark.tsx` | مكوّن React (`WazenMark`, `WazenMarkFramed`) |
| `public/brand/wazen-mark.svg` | أيقونة مؤطّرة للاستخدام المباشر |
| `public/brand/wazen-mark.png` | Apple touch / OG / متاجر |
| `public/brand/wazen-lockup.svg` | علامة + وازن + WAZEN |
| `public/brand/wazen-equilibrium.svg` | نسخة تسويقية مع الشعار |
| `public/brand/wazen-brand-reference.png` | المرجع البصري الكامل (infographic) |
| `public/favicon.svg` | أيقونة المتصفح |

## لوحة الألوان

| الدور | Hex | الاستخدام |
|-------|-----|-----------|
| Slate Navy | `#0F172A` | نص أساسي، حلقة شخصية، ثقة |
| Emerald | `#10B981` | تأكيد، نمو، حلقة مشتركة |
| Tech Blue | `#2563EB` | بديل تقني (اختياري) |
| Surface | `#F6F9FC` | خلفيات |
| Muted | `#64748B` | نص ثانوي |

## كود SVG (للنسخ)

```svg
<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 8 36 C 8 20, 20 10, 32 10 C 38 10, 42 14, 42 20 C 42 28, 30 36, 18 36 Z" fill="#0F172A"/>
  <path d="M 40 12 C 40 28, 28 38, 16 38 C 10 38, 6 34, 6 28 C 6 20, 18 12, 30 12 Z" fill="#10B981" fill-opacity="0.92"/>
  <circle cx="24" cy="24" r="4.5" fill="#FFFFFF"/>
  <circle cx="24" cy="24" r="2.5" fill="#0F172A"/>
</svg>
```

## الخطوط

- **Cairo** — عربي + لاتيني في الواجهة (`app/layout.tsx`)
- بدائل: Readex Pro، IBM Plex Sans Arabic، Tajawal

## الاستخدام في الكود

```tsx
import { WazenMarkFramed } from "./wazen-mark";

<WazenMarkFramed size={38} />
```

- `Brand` في `app/commercial-kit.tsx` يستخدم المكوّن مباشرة.
- لا تستخدم ميزاناً تقليدياً ولا فقاعة دردشة في الشعار.
