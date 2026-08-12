# هوية وازن البصرية (Brand)

- شعار الموقع الرسمي: `public/brand/wazen-lockup.png`
- صفحة من نحن + شرح الشعار: [`/about`](/about)
- `/brand` يحوّل تلقائياً إلى `/about#logo`

## الاستخدام في الكود

```tsx
import WazenLogo, { WazenIcon } from "@/components/brand/WazenLogo";

// شعار الموقع الكامل (Lockup)
<WazenLogo showText iconClassName="h-11 w-auto" />

// الرمز فقط
<WazenIcon className="h-9 w-auto" />
```

## الملفات

| الملف | الاستخدام |
|-------|-----------|
| `wazen-lockup.png` | شعار الموقع (رمز + WAZEN + وازن) |
| `wazen-mark.png` | الرمز فقط |
| `wazen-app-icon.png` | أيقونة التطبيق |
| `wazen-brand-board.png` | لوح الهوية الكامل |
