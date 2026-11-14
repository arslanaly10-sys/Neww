/** Static, hand-written sample content. Everything here is fictional. */

export const USERS = [
  { id: "u-investor", name: "Karim Fahmy", nameAr: "كريم فهمي", email: "karim@sample.test", role: "investor", title: "Investor, Sample Family Office", titleAr: "مستثمر، مكتب عائلي تجريبي" },
  { id: "u-manager-1", name: "Nour Abdelrahman", nameAr: "نور عبد الرحمن", email: "nour@sample.test", role: "manager", title: "Asset Manager", titleAr: "مدير أصول" },
  { id: "u-manager-2", name: "Omar Saleh", nameAr: "عمر صالح", email: "omar@sample.test", role: "manager", title: "Senior Asset Manager", titleAr: "مدير أصول أول" },
  { id: "u-analyst", name: "Laila Mansour", nameAr: "ليلى منصور", email: "laila@sample.test", role: "analyst", title: "Valuation Analyst", titleAr: "محللة تقييم" },
  { id: "u-admin", name: "Salma Rashed", nameAr: "سلمى راشد", email: "salma@sample.test", role: "admin", title: "Platform Administrator", titleAr: "مسؤولة المنصة" },
] as const;

export const DISTRICTS = [
  { id: "new-cairo", name: "New Cairo", nameAr: "القاهرة الجديدة", lat: 30.0074, lng: 31.4913 },
  { id: "sheikh-zayed", name: "Sheikh Zayed", nameAr: "الشيخ زايد", lat: 30.0131, lng: 30.9784 },
  { id: "6th-october", name: "6th of October", nameAr: "السادس من أكتوبر", lat: 29.9285, lng: 30.9188 },
  { id: "new-capital", name: "New Administrative Capital", nameAr: "العاصمة الإدارية الجديدة", lat: 30.0200, lng: 31.7600 },
  { id: "maadi", name: "Maadi", nameAr: "المعادي", lat: 29.9602, lng: 31.2569 },
  { id: "zamalek", name: "Zamalek", nameAr: "الزمالك", lat: 30.0626, lng: 31.2197 },
  { id: "heliopolis", name: "Heliopolis", nameAr: "مصر الجديدة", lat: 30.0910, lng: 31.3225 },
  { id: "nasr-city", name: "Nasr City", nameAr: "مدينة نصر", lat: 30.0561, lng: 31.3300 },
  { id: "north-coast", name: "North Coast", nameAr: "الساحل الشمالي", lat: 30.9500, lng: 28.8000 },
  { id: "dokki", name: "Dokki", nameAr: "الدقي", lat: 30.0383, lng: 31.2120 },
] as const;

/** Monthly drift (percent) over the 36-month window, and the drift over the last 3 months. Synthetic. */
export const DISTRICT_TREND: Record<string, { drift: number; recent: number; vol: number }> = {
  "new-cairo": { drift: 1.15, recent: 1.9, vol: 0.5 },
  "sheikh-zayed": { drift: 1.05, recent: 1.4, vol: 0.5 },
  "6th-october": { drift: 0.95, recent: 0.3, vol: 0.45 },
  "new-capital": { drift: 1.3, recent: 2.2, vol: 0.8 },
  maadi: { drift: 0.9, recent: 0.7, vol: 0.35 },
  zamalek: { drift: 0.8, recent: -0.4, vol: 0.4 },
  heliopolis: { drift: 0.85, recent: 0.1, vol: 0.35 },
  "nasr-city": { drift: 0.9, recent: -1.5, vol: 0.45 },
  "north-coast": { drift: 1.25, recent: -2.1, vol: 0.9 },
  dokki: { drift: 0.85, recent: 0.8, vol: 0.4 },
};

export type AssetType = "apartment" | "villa" | "office" | "retail" | "land" | "mixed";
export type Finish = "core_shell" | "semi_finished" | "fully_finished" | "luxury";

export interface AssetSeed {
  d: string; type: AssetType; name: string; nameAr: string; compound: string;
  area: number; floor: number | null; finish: Finish; built: number | null;
  occ: "let" | "vacant" | "owner" | "land"; acquired: string;
  lease?: { tenant: number; start: string; end: string; usd?: boolean; indexation: number; deposit: number };
  vacantSince?: string;
}

/** 30 assets, three per district. Names and compounds are invented. */
export const ASSETS: AssetSeed[] = [
  // New Cairo
  { d: "new-cairo", type: "apartment", name: "Palm Court 4B", nameAr: "بالم كورت 4 ب", compound: "Palm Court", area: 185, floor: 4, finish: "fully_finished", built: 2019, occ: "let", acquired: "2021-03-15", lease: { tenant: 0, start: "2025-09-01", end: "2027-08-31", indexation: 10, deposit: 2 } },
  { d: "new-cairo", type: "office", name: "Tagamoa Business Hub, Floor 6", nameAr: "مركز التجمع للأعمال، الدور السادس", compound: "Tagamoa Business Hub", area: 620, floor: 6, finish: "fully_finished", built: 2021, occ: "let", acquired: "2022-06-20", lease: { tenant: 1, start: "2024-02-01", end: "2027-01-31", indexation: 8, deposit: 3 } },
  { d: "new-cairo", type: "villa", name: "Jasmine Gardens Villa 12", nameAr: "فيلا 12 حدائق الياسمين", compound: "Jasmine Gardens", area: 480, floor: null, finish: "luxury", built: 2018, occ: "owner", acquired: "2020-01-10" },
  // Sheikh Zayed
  { d: "sheikh-zayed", type: "villa", name: "Dunes Residence Villa 7", nameAr: "فيلا 7 ريزيدنس الكثبان", compound: "Dunes Residence", area: 420, floor: null, finish: "fully_finished", built: 2017, occ: "let", acquired: "2020-09-05", lease: { tenant: 2, start: "2025-01-01", end: "2026-12-31", indexation: 10, deposit: 2 } },
  { d: "sheikh-zayed", type: "retail", name: "Zayed Arcade, Unit 14", nameAr: "أركيد زايد، وحدة 14", compound: "Zayed Arcade", area: 160, floor: 0, finish: "fully_finished", built: 2020, occ: "let", acquired: "2022-02-14", lease: { tenant: 3, start: "2023-11-01", end: "2028-10-31", indexation: 7, deposit: 3 } },
  { d: "sheikh-zayed", type: "land", name: "Plot 31, Beverly Extension", nameAr: "قطعة 31، امتداد بيفرلي", compound: "Beverly Extension", area: 2400, floor: null, finish: "core_shell", built: null, occ: "land", acquired: "2019-05-22" },
  // 6th of October
  { d: "6th-october", type: "apartment", name: "Orchid Heights 2A", nameAr: "أوركيد هايتس 2 أ", compound: "Orchid Heights", area: 140, floor: 2, finish: "semi_finished", built: 2022, occ: "let", acquired: "2023-04-02", lease: { tenant: 4, start: "2025-04-01", end: "2027-03-31", indexation: 10, deposit: 2 } },
  { d: "6th-october", type: "mixed", name: "Gardenia Mixed-Use Block", nameAr: "مبنى جاردينيا متعدد الاستخدام", compound: "Gardenia Plaza", area: 1150, floor: null, finish: "fully_finished", built: 2016, occ: "let", acquired: "2019-11-30", lease: { tenant: 5, start: "2024-07-01", end: "2029-06-30", indexation: 6, deposit: 4 } },
  { d: "6th-october", type: "land", name: "Plot 8, Industrial Edge", nameAr: "قطعة 8، الحافة الصناعية", compound: "Industrial Edge", area: 3600, floor: null, finish: "core_shell", built: null, occ: "land", acquired: "2018-08-18" },
  // New Capital
  { d: "new-capital", type: "office", name: "Capital Gate Tower, Floor 11", nameAr: "برج بوابة العاصمة، الدور 11", compound: "Capital Gate", area: 540, floor: 11, finish: "fully_finished", built: 2024, occ: "let", acquired: "2024-05-12", lease: { tenant: 6, start: "2024-09-01", end: "2027-02-28", usd: true, indexation: 5, deposit: 3 } },
  { d: "new-capital", type: "apartment", name: "Lotus Residences 9C", nameAr: "لوتس ريزيدنس 9 ج", compound: "Lotus Residences", area: 165, floor: 9, finish: "semi_finished", built: 2024, occ: "vacant", vacantSince: "2026-07-01", acquired: "2024-07-20" },
  { d: "new-capital", type: "retail", name: "Central Boulevard Shop 3", nameAr: "محل 3 البوليفارد المركزي", compound: "Central Boulevard", area: 95, floor: 0, finish: "core_shell", built: 2025, occ: "vacant", vacantSince: "2026-03-01", acquired: "2025-01-15" },
  // Maadi
  { d: "maadi", type: "apartment", name: "Corniche View 6A", nameAr: "كورنيش فيو 6 أ", compound: "Corniche View", area: 210, floor: 6, finish: "luxury", built: 2012, occ: "let", acquired: "2018-02-28", lease: { tenant: 7, start: "2025-06-01", end: "2027-05-31", indexation: 8, deposit: 2 } },
  { d: "maadi", type: "villa", name: "Degla Garden House 3", nameAr: "بيت حديقة دجلة 3", compound: "Degla Gardens", area: 380, floor: null, finish: "fully_finished", built: 1998, occ: "let", acquired: "2019-04-09", lease: { tenant: 8, start: "2024-12-01", end: "2026-12-01", indexation: 8, deposit: 2 } },
  { d: "maadi", type: "retail", name: "Road 9 Ground Floor Unit", nameAr: "وحدة الدور الأرضي، شارع 9", compound: "Road 9 Parade", area: 130, floor: 0, finish: "fully_finished", built: 2005, occ: "let", acquired: "2021-10-18", lease: { tenant: 9, start: "2022-01-01", end: "2027-12-31", indexation: 7, deposit: 3 } },
  // Zamalek
  { d: "zamalek", type: "apartment", name: "Nile Terrace 5", nameAr: "تراس النيل 5", compound: "Nile Terrace", area: 260, floor: 5, finish: "luxury", built: 1965, occ: "let", acquired: "2017-07-07", lease: { tenant: 10, start: "2025-03-01", end: "2027-02-28", usd: true, indexation: 5, deposit: 3 } },
  { d: "zamalek", type: "office", name: "Brazil Street Office Suite", nameAr: "جناح مكتبي، شارع البرازيل", compound: "Brazil Street House", area: 310, floor: 3, finish: "fully_finished", built: 1972, occ: "let", acquired: "2020-12-01", lease: { tenant: 11, start: "2023-01-01", end: "2027-12-31", indexation: 8, deposit: 3 } },
  { d: "zamalek", type: "apartment", name: "Gezira Courtyard 2", nameAr: "فناء الجزيرة 2", compound: "Gezira Courtyard", area: 175, floor: 2, finish: "fully_finished", built: 1958, occ: "owner", acquired: "2016-11-11" },
  // Heliopolis
  { d: "heliopolis", type: "apartment", name: "Korba Residence 3B", nameAr: "ريزيدنس الكوربة 3 ب", compound: "Korba Residence", area: 190, floor: 3, finish: "fully_finished", built: 1985, occ: "let", acquired: "2019-08-26", lease: { tenant: 12, start: "2025-10-01", end: "2027-09-30", indexation: 8, deposit: 2 } },
  { d: "heliopolis", type: "retail", name: "Baghdad Street Shop 2", nameAr: "محل 2 شارع بغداد", compound: "Baghdad Street Row", area: 110, floor: 0, finish: "fully_finished", built: 1990, occ: "let", acquired: "2021-06-14", lease: { tenant: 13, start: "2024-01-01", end: "2026-12-31", indexation: 7, deposit: 3 } },
  { d: "heliopolis", type: "office", name: "Roxy Square Office 4", nameAr: "مكتب 4 ميدان روكسي", compound: "Roxy Offices", area: 240, floor: 4, finish: "semi_finished", built: 1978, occ: "vacant", vacantSince: "2026-05-15", acquired: "2022-09-30" },
  // Nasr City
  { d: "nasr-city", type: "apartment", name: "Abbas Residence 7D", nameAr: "ريزيدنس العباس 7 د", compound: "Abbas Residence", area: 150, floor: 7, finish: "semi_finished", built: 2008, occ: "let", acquired: "2020-05-19", lease: { tenant: 14, start: "2025-07-01", end: "2027-06-30", indexation: 10, deposit: 2 } },
  { d: "nasr-city", type: "mixed", name: "Makram Ebeid Block", nameAr: "مبنى مكرم عبيد", compound: "Makram Block", area: 980, floor: null, finish: "fully_finished", built: 2010, occ: "let", acquired: "2018-12-12", lease: { tenant: 15, start: "2023-05-01", end: "2028-04-30", indexation: 6, deposit: 4 } },
  { d: "nasr-city", type: "land", name: "Plot 14, Seventh District", nameAr: "قطعة 14، الحي السابع", compound: "Seventh District", area: 1800, floor: null, finish: "core_shell", built: null, occ: "land", acquired: "2020-03-03" },
  // North Coast
  { d: "north-coast", type: "villa", name: "Marina Bay Chalet 21", nameAr: "شاليه 21 خليج المارينا", compound: "Marina Bay", area: 220, floor: null, finish: "luxury", built: 2022, occ: "owner", acquired: "2023-02-18" },
  { d: "north-coast", type: "apartment", name: "Sandstone Beach 1F", nameAr: "ساندستون بيتش 1 و", compound: "Sandstone Beach", area: 120, floor: 1, finish: "fully_finished", built: 2023, occ: "let", acquired: "2024-03-08", lease: { tenant: 16, start: "2026-06-01", end: "2027-05-31", indexation: 8, deposit: 2 } },
  { d: "north-coast", type: "retail", name: "Lagoon Promenade Kiosk Row", nameAr: "صف أكشاك ممشى اللاجون", compound: "Lagoon Promenade", area: 85, floor: 0, finish: "fully_finished", built: 2023, occ: "vacant", vacantSince: "2026-09-20", acquired: "2024-10-02" },
  // Dokki
  { d: "dokki", type: "apartment", name: "Mesaha Heights 8A", nameAr: "مساحة هايتس 8 أ", compound: "Mesaha Heights", area: 200, floor: 8, finish: "fully_finished", built: 2014, occ: "let", acquired: "2019-02-02", lease: { tenant: 17, start: "2025-02-01", end: "2027-01-31", indexation: 8, deposit: 2 } },
  { d: "dokki", type: "office", name: "Tahrir Street Office 2", nameAr: "مكتب 2 شارع التحرير", compound: "Tahrir Offices", area: 420, floor: 2, finish: "fully_finished", built: 2001, occ: "let", acquired: "2021-01-25", lease: { tenant: 18, start: "2024-04-01", end: "2027-03-31", indexation: 8, deposit: 3 } },
  { d: "dokki", type: "apartment", name: "Wadi Al Nil Flat 5C", nameAr: "شقة 5 ج وادي النيل", compound: "Wadi Al Nil Court", area: 155, floor: 5, finish: "semi_finished", built: 1995, occ: "let", acquired: "2022-08-08", lease: { tenant: 19, start: "2025-12-01", end: "2027-11-30", indexation: 8, deposit: 2 } },
];

/** Fictional tenants. No real firms. */
export const TENANTS = [
  { nameAr: "مستأجر تجريبي أ (أسرة)", name: "Sample Tenant A (family)", sector: "Residential" },
  { nameAr: "نورثغيت للاستشارات (وهمية)", name: "Northgate Advisory (fictional)", sector: "Professional services" },
  { nameAr: "مستأجر تجريبي ج (أسرة)", name: "Sample Tenant C (family)", sector: "Residential" },
  { nameAr: "دايلي باسكت للبقالة (وهمية)", name: "Daily Basket Grocers (fictional)", sector: "Retail" },
  { nameAr: "مستأجر تجريبي هـ (أسرة)", name: "Sample Tenant E (family)", sector: "Residential" },
  { nameAr: "عيادة جاردينيا للرعاية (وهمية)", name: "Gardenia Care Clinic (fictional)", sector: "Healthcare" },
  { nameAr: "أوربت لبرمجيات القاهرة (وهمية)", name: "Orbit Software Cairo (fictional)", sector: "Technology" },
  { nameAr: "مستأجر تجريبي ح (أسرة وافدة)", name: "Sample Tenant H (expat family)", sector: "Residential" },
  { nameAr: "مستأجر تجريبي ط (أسرة)", name: "Sample Tenant I (family)", sector: "Residential" },
  { nameAr: "شركة صيدلية الناصية (وهمية)", name: "Corner Pharmacy Co. (fictional)", sector: "Healthcare" },
  { nameAr: "مستأجر تجريبي ك (سلك دبلوماسي)", name: "Sample Tenant K (diplomatic)", sector: "Residential" },
  { nameAr: "ستوديو دلتا للتصميم (وهمي)", name: "Delta Design Studio (fictional)", sector: "Creative" },
  { nameAr: "مستأجر تجريبي م (أسرة)", name: "Sample Tenant M (family)", sector: "Residential" },
  { nameAr: "سيلك رود للقرطاسية (وهمية)", name: "Silk Road Stationers (fictional)", sector: "Retail" },
  { nameAr: "مستأجر تجريبي ع (أسرة)", name: "Sample Tenant O (family)", sector: "Residential" },
  { nameAr: "مركز مكرم للتعليم (وهمي)", name: "Makram Learning Centre (fictional)", sector: "Education" },
  { nameAr: "مستأجر تجريبي ف (موسمي)", name: "Sample Tenant Q (seasonal)", sector: "Residential" },
  { nameAr: "مستأجر تجريبي ر (أسرة)", name: "Sample Tenant R (family)", sector: "Residential" },
  { nameAr: "شركاء التحرير للمحاسبة (وهمية)", name: "Tahrir Accounting Partners (fictional)", sector: "Professional services" },
  { nameAr: "مستأجر تجريبي ت (أسرة)", name: "Sample Tenant T (family)", sector: "Residential" },
] as const;

export const UPDATES: { title: string; titleAr: string; body: string; bodyAr: string; assetIdx?: number }[] = [
  { title: "Q3 portfolio review: income steady, valuations re-based", titleAr: "مراجعة الربع الثالث: دخل مستقر وإعادة تقييم الأصول",
    body: "Rental collection held steady through the quarter. Six assets were re-valued against fresh comparable sales; three moved by more than five percent. Details are in the valuation history on each asset.",
    bodyAr: "حافظ تحصيل الإيجارات على استقراره طوال الربع. أُعيد تقييم ستة أصول استناداً إلى مبيعات مقارنة حديثة، وتحرك ثلاثة منها بأكثر من خمسة في المئة. تجدون التفاصيل في سجل التقييم لكل أصل." },
  { title: "Lease renewal under negotiation: Capital Gate Tower", titleAr: "تجديد عقد قيد التفاوض: برج بوابة العاصمة",
    body: "The tenant on floor 11 has asked to extend for a further three years. We are reviewing the indexation clause before proposing terms. No decision has been made.",
    bodyAr: "طلب المستأجر في الدور الحادي عشر تمديد العقد ثلاث سنوات إضافية. نراجع بند الزيادة السنوية قبل عرض الشروط، ولم يُتخذ أي قرار بعد.", assetIdx: 9 },
  { title: "Vacancy at Lotus Residences 9C", titleAr: "شغور في لوتس ريزيدنس 9 ج",
    body: "The unit has been vacant since July. The cost of vacancy is now shown on the asset page. We have asked for two independent rental opinions before changing the asking rent.",
    bodyAr: "الوحدة شاغرة منذ يوليو، وتظهر تكلفة الشغور الآن في صفحة الأصل. طلبنا رأيين مستقلين في القيمة الإيجارية قبل تعديل السعر المطلوب.", assetIdx: 10 },
  { title: "Insurance certificates: two renewals outstanding", titleAr: "شهادات التأمين: تجديدان قيد الانتظار",
    body: "Two insurance certificates have expired and replacements are with the insurer. Both assets are flagged in Alerts until the documents are verified.",
    bodyAr: "انتهت صلاحية شهادتي تأمين، والبدائل لدى شركة التأمين. يبقى الأصلان مُعلَّمين في التنبيهات حتى يجري التحقق من المستندات." },
  { title: "Market note: North Coast cooling after a strong summer", titleAr: "ملاحظة سوقية: تباطؤ الساحل الشمالي بعد صيف قوي",
    body: "The sample North Coast series shows negative three-month momentum. It is a seasonal pattern as well as a trend, so we are not drawing conclusions from one quarter.",
    bodyAr: "تُظهر سلسلة الساحل الشمالي التجريبية زخماً سلبياً خلال ثلاثة أشهر. يجمع هذا بين نمط موسمي واتجاه، ولذلك لا نستخلص نتائج من ربع واحد." },
  { title: "Title deed for Plot 31 still outstanding", titleAr: "عقد ملكية القطعة 31 ما زال ناقصاً",
    body: "The registered deed for the Sheikh Zayed plot is missing from the file. Legal counsel has been asked to obtain a certified copy.",
    bodyAr: "عقد التسجيل الخاص بقطعة الشيخ زايد غير موجود في الملف. طلبنا من المستشار القانوني الحصول على نسخة موثقة.", assetIdx: 5 },
  { title: "Scenario review: a weaker pound", titleAr: "مراجعة سيناريو: جنيه أضعف",
    body: "At a weaker pound, two USD-denominated leases lift reported income while borrowing costs press on values. See the saved scenarios for the assumptions behind each case.",
    bodyAr: "عند ضعف الجنيه يرتفع الدخل المحتسب من عقدين بالدولار، بينما تضغط تكلفة التمويل على القيم. راجعوا السيناريوهات المحفوظة لمعرفة افتراضات كل حالة." },
  { title: "Maadi: Degla Garden House lease ends in December", titleAr: "المعادي: ينتهي عقد بيت حديقة دجلة في ديسمبر",
    body: "The lease ends on 1 December. Renewal terms are being drafted. The renewal option in the contract gives the tenant a first right to extend.",
    bodyAr: "ينتهي العقد في الأول من ديسمبر، ونعمل على صياغة شروط التجديد. يمنح بند التجديد في العقد المستأجر أولوية التمديد.", assetIdx: 13 },
  { title: "Rent receipts: October collected in full", titleAr: "إيصالات الإيجار: تحصيل أكتوبر كاملاً",
    body: "All active leases paid October rent on time. Receipts are linked from each asset's income table for managers.",
    bodyAr: "سدّدت جميع العقود السارية إيجار أكتوبر في موعده. ترتبط الإيصالات بجدول الدخل في كل أصل للمديرين." },
  { title: "Roxy Square office back on the market", titleAr: "مكتب ميدان روكسي يُعرض من جديد",
    body: "The vacant Heliopolis office has been re-listed after light refurbishment. Vacancy cost so far is shown in Alerts.",
    bodyAr: "أُعيد عرض المكتب الشاغر في مصر الجديدة بعد تجديد خفيف. تظهر تكلفة الشغور حتى الآن في التنبيهات.", assetIdx: 20 },
  { title: "New valuation assumptions, version 1.0.0", titleAr: "افتراضات التقييم الجديدة، الإصدار 1.0.0",
    body: "The valuation model now runs on a versioned assumption set. Any valuation can be reproduced from its recorded version and hash.",
    bodyAr: "يعمل نموذج التقييم الآن على مجموعة افتراضات مرقّمة بإصدار. يمكن إعادة إنتاج أي تقييم من الإصدار والبصمة المسجلين." },
  { title: "Draft: year-end investor letter", titleAr: "مسودة: رسالة المستثمرين لنهاية العام",
    body: "Draft pending asset manager approval. Do not circulate.",
    bodyAr: "مسودة بانتظار موافقة مدير الأصول. يُرجى عدم تداولها." },
];

export const MARKET_SOURCES = [
  {
    id: "ms-price-index", title: "District residential price index (synthetic)", titleAr: "مؤشر أسعار السكن بحسب الحي (بيانات تجريبية)",
    provenance: "synthetic", publishedOn: "2026-11-01",
    productionSource: "CBE and CAPMAS, where a series is published",
    productionSourceAr: "البنك المركزي المصري والجهاز المركزي للتعبئة العامة والإحصاء، حيثما تُنشر سلسلة",
    note: "Generated at seed time for this demo. No figure is a CAPMAS or CBE number. In production the series would be loaded from their publications with the publication date recorded per release.",
    noteAr: "أُنشئت عند تجهيز البيانات لهذا العرض. لا يمثل أي رقم هنا بيانات الجهاز المركزي للتعبئة العامة والإحصاء أو البنك المركزي. في الإنتاج تُحمَّل السلسلة من منشوراتهما مع تسجيل تاريخ كل إصدار.",
  },
  {
    id: "ms-commercial", title: "Commercial property prices", titleAr: "أسعار العقارات التجارية",
    provenance: "not_published", publishedOn: null,
    productionSource: "No regular public series known. Would need licensed broker research.",
    productionSourceAr: "لا توجد سلسلة عامة منتظمة معروفة، وتتطلب أبحاث وسطاء مرخّصين.",
    note: "Not published as a regular public series in Egypt. ZMNHOOF OS shows nothing here rather than inventing it.",
    noteAr: "لا تتوفر سلسلة عامة منتظمة لها في مصر. تفضّل المنصة ألا تعرض شيئاً بدلاً من اختلاق أرقام.",
  },
  {
    id: "ms-rent-index", title: "District rental index", titleAr: "مؤشر الإيجارات بحسب الحي",
    provenance: "not_published", publishedOn: null,
    productionSource: "No reliable public district series known.",
    productionSourceAr: "لا توجد سلسلة عامة موثوقة معروفة على مستوى الأحياء.",
    note: "No reliable district rental series is published. The demo does not simulate one.",
    noteAr: "لا تتوفر سلسلة موثوقة لإيجارات الأحياء، ولا يحاكي العرض سلسلة بديلة.",
  },
] as const;
