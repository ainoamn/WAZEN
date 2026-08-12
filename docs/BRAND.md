# هوية وازن البصرية (Brand)

المفهوم: **W هندسي Minimal Fintech** — جناح كحلي (مال شخصي) + جناح تركوازي (مال مشترك) + نواة اتزان.

## المكوّن

```tsx
import WazenLogo, { WazenIcon } from "@/components/brand/WazenLogo";

// Navbar: [رمز] WAZEN
<WazenLogo iconClassName="h-10 w-12" showText />

// أيقونة فقط
<WazenIcon className="h-9 w-[2.7rem]" />

// تسجيل الدخول: + وازن
<WazenLogo showText showArabic iconClassName="h-10 w-12" />

// وضع داكن
<WazenLogo variant="dark" iconClassName="h-10 w-12" />
```

## الملفات SVG (Vector فقط)

| الملف | الاستخدام |
|-------|-----------|
| `components/brand/WazenLogo.tsx` | المكوّن الرئيسي |
| `public/favicon.svg` | favicon — رمز فقط |
| `public/brand/wazen-mark.svg` | رمز standalone |
| `public/brand/wazen-app-icon.svg` | أيقونة مربعة `#0F172A` |

## الألوان

| الاسم | Hex |
|-------|-----|
| Navy | `#0F172A` |
| Deep Navy | `#08213D` |
| Teal | `#0F9F91` |
| Emerald | `#10B981` |
| Light | `#F8FAFC` |

## قواعد

- الاسم الرسمي: **WAZEN** (ليس WAZEN ROAN)
- الهيدر: `[رمز] WAZEN` بدون «وازen» أسفل الاسم
- «وازن» تظهر في صفحات الهوية/تسجيل الدخول فقط (`showArabic`)
- لا PNG/JPG للشعار — SVG فقط
- لا ميزان تقليدي، لا $، لا R، لا أسهم نمو

## كود SVG للرمز

```svg
<svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Left wing: personal -->
  <path d="M8 18 C8 14 12 12 16 12 H29 C33 12 36 14 38 18 L58 57 L47 76 C44 82 37 86 30 86 C23 86 17 82 14 76 L2 28 C1 23 3 19 8 18 Z" fill="#173B63"/>
  <!-- Right wing: shared -->
  <path d="M112 18 C112 14 108 12 104 12 H91 C87 12 84 14 82 18 L62 57 L73 76 C76 82 83 86 90 86 C97 86 103 82 106 76 L118 28 C119 23 117 19 112 18 Z" fill="#0F9F91"/>
  <!-- Balance core -->
  <path d="M60 35 C55 42 52 50 52 59 C52 65 55 70 60 74 C65 70 68 65 68 59 C68 50 65 42 60 35 Z" fill="#F8FAFC"/>
  <circle cx="60" cy="22" r="7" fill="#0F9F91"/>
</svg>
```
