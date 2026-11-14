/**
 * The data-source registry: every outside source the platform uses or plans to use, by market-intelligence layer,
 * with how it is reached and its licence. Status and freshness come from the import log, not from this list.
 */
export type Layer = "official" | "location" | "climate" | "earth" | "property";
export type Access = "api" | "file" | "partnership" | "planned" | "internal";
export interface SourceDef { id: string; name: string; nameAr: string; layer: Layer; access: Access; licence: string; homepage: string; cadenceDays: number | null; coverage: string; coverageAr: string; note: string; noteAr: string }

export const LAYERS: Layer[] = ["official", "location", "climate", "earth", "property"];

export const SOURCES: SourceDef[] = [
  { id: "worldbank", name: "World Bank Indicators API", nameAr: "واجهة مؤشرات البنك الدولي", layer: "official", access: "api", licence: "CC BY 4.0", homepage: "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392", cadenceDays: 90,
    coverage: "Egypt, annual: population, urban share, GDP growth, inflation, consumer price index, official exchange rate, lending rate.", coverageAr: "مصر، سنويًا: السكان، ونسبة الحضر، ونمو الناتج، والتضخم، ومؤشر أسعار المستهلكين، وسعر الصرف الرسمي، وسعر الإقراض.",
    note: "Country-level context. It explains the economy around the portfolio; it is not evidence of any property's price.", noteAr: "سياق على مستوى الدولة. يشرح الاقتصاد المحيط بالمحفظة، وليس دليلًا على سعر أي عقار." },
  { id: "capmas_cpi", name: "CAPMAS consumer price index", nameAr: "مؤشر أسعار المستهلكين من الجهاز المركزي للتعبئة العامة والإحصاء", layer: "official", access: "file", licence: "CAPMAS terms (vary by dataset)", homepage: "https://metadata.capmas.gov.eg/en/index.php/catalog", cadenceDays: 31,
    coverage: "Monthly urban CPI, and building-material price collections where the catalog has downloadable data.", coverageAr: "مؤشر أسعار المستهلكين الحضري شهريًا، وأسعار مواد البناء حيث تتوفر بيانات قابلة للتنزيل في الكتالوج.",
    note: "No public API: an administrator imports the published file. Some catalog entries have no downloadable data, so the date of each import is shown.", noteAr: "لا توجد واجهة عامة: يستورد المسؤول الملف المنشور. وبعض مدخلات الكتالوج بلا بيانات قابلة للتنزيل، لذا يظهر تاريخ كل استيراد." },
  { id: "cbe_fx", name: "Central Bank of Egypt exchange rates", nameAr: "أسعار الصرف من البنك المركزي المصري", layer: "official", access: "file", licence: "CBE terms of use", homepage: "https://cbe.org.eg/en/economic-research/statistics/cbe-exchange-rates", cadenceDays: 7,
    coverage: "Official EGP/USD rates and interest rates for EGP reporting and valuations.", coverageAr: "أسعار الجنيه مقابل الدولار الرسمية وأسعار الفائدة للتقارير والتقييمات بالجنيه.",
    note: "No documented public API: an administrator imports the published figures until a data-access agreement exists.", noteAr: "لا توجد واجهة عامة موثقة: يستورد المسؤول الأرقام المنشورة إلى أن يوجد اتفاق للوصول إلى البيانات." },
  { id: "worldpop", name: "WorldPop API", nameAr: "واجهة WorldPop", layer: "location", access: "api", licence: "CC BY 4.0", homepage: "https://api.worldpop.org/v3", cadenceDays: 365,
    coverage: "People living within 1 km and 3 km (straight line) of each asset, 100 m grid, current year.", coverageAr: "عدد السكان ضمن 1 كم و3 كم (خط مستقيم) من كل أصل، شبكة 100 م، للسنة الحالية.",
    note: "Modelled estimates from WorldPop Global2 (release R2025A). Population context helps judge a location; it is not a value.", noteAr: "تقديرات نموذجية من WorldPop Global2 (إصدار R2025A). يساعد السياق السكاني على تقدير الموقع، وليس قيمة." },
  { id: "osm", name: "OpenStreetMap via Overpass", nameAr: "أوبن ستريت ماب عبر Overpass", layer: "location", access: "api", licence: "ODbL 1.0 (© OpenStreetMap contributors)", homepage: "https://wiki.openstreetmap.org/wiki/Overpass_API", cadenceDays: 90,
    coverage: "Schools, health care, pharmacies, supermarkets, banks, places to eat and bus stops within 1 km of each asset.", coverageAr: "المدارس والرعاية الصحية والصيدليات والمتاجر الكبرى والبنوك والمطاعم ومواقف الحافلات ضمن 1 كم من كل أصل.",
    note: "Public Overpass servers are for light use; production needs its own copy or Overture Maps downloads. Distances are straight-line, not travel time.", noteAr: "خوادم Overpass العامة للاستخدام الخفيف؛ ويحتاج الإنتاج إلى نسخة خاصة أو تنزيلات Overture Maps. المسافات خط مستقيم وليست زمن تنقل." },
  { id: "ghsl", name: "GHSL built-up and population grids", nameAr: "شبكات GHSL للمناطق المبنية والسكان", layer: "location", access: "planned", licence: "CC BY 4.0", homepage: "https://human-settlement.emergency.copernicus.eu/", cadenceDays: null,
    coverage: "How each district's built-up area has grown since 1975.", coverageAr: "كيف نمت المساحة المبنية في كل حي منذ 1975.", note: "Planned: bulk downloads, processed offline.", noteAr: "مخطط: تنزيلات كبيرة تُعالج خارج الخط." },
  { id: "hdx", name: "HDX administrative boundaries", nameAr: "الحدود الإدارية من HDX", layer: "location", access: "planned", licence: "Varies by dataset", homepage: "https://ocha-dap.github.io/cod-site/", cadenceDays: null,
    coverage: "Governorate and district boundaries to standardise maps and comparisons.", coverageAr: "حدود المحافظات والأحياء لتوحيد الخرائط والمقارنات.", note: "Planned: check each dataset's licence before commercial use.", noteAr: "مخطط: يُراجع ترخيص كل مجموعة بيانات قبل الاستخدام التجاري." },
  { id: "nasa_power", name: "NASA POWER climatology", nameAr: "المناخ من NASA POWER", layer: "climate", access: "api", licence: "NASA open data (cite NASA Langley POWER)", homepage: "https://power.larc.nasa.gov/api/pages/", cadenceDays: 365,
    coverage: "Long-term average temperature, rainfall and solar radiation at each district centre.", coverageAr: "متوسطات طويلة الأجل لدرجة الحرارة والأمطار والإشعاع الشمسي في مركز كل حي.",
    note: "Weather context for exposure and solar potential. It says nothing about a building's condition.", noteAr: "سياق مناخي للتعرض وإمكانات الطاقة الشمسية. ولا يقول شيئًا عن حالة المبنى." },
  { id: "nasa_flood", name: "NASA near-real-time flood products", nameAr: "منتجات الفيضانات شبه الآنية من ناسا", layer: "climate", access: "planned", licence: "NASA open data", homepage: "https://lance.modaps.eosdis.nasa.gov/flood/", cadenceDays: null,
    coverage: "Broad flood screening at about 250 m.", coverageAr: "فرز عام للفيضانات بدقة نحو 250 م.", note: "Planned: a screening signal only, never a property-level flood assessment.", noteAr: "مخطط: إشارة فرز فقط، وليست تقييمًا للفيضان على مستوى العقار." },
  { id: "copernicus", name: "Copernicus Data Space (Sentinel imagery)", nameAr: "كوبرنيكوس (صور سنتينل)", layer: "earth", access: "planned", licence: "Copernicus data licence (free and open)", homepage: "https://documentation.dataspace.copernicus.eu/", cadenceDays: null,
    coverage: "Satellite imagery to watch visible construction and land-use change on plots and projects.", coverageAr: "صور أقمار صناعية لمتابعة التغير المرئي في البناء واستخدام الأرض في القطع والمشروعات.",
    note: "Planned via STAC and Sentinel Hub. Imagery can show change; it cannot confirm title, legal construction or a unit's interior.", noteAr: "مخطط عبر STAC وSentinel Hub. الصور تُظهر التغير، ولا تؤكد الملكية أو قانونية البناء أو داخل الوحدة." },
  { id: "sample_comps", name: "Comparable sales (sample)", nameAr: "المبيعات المماثلة (تجريبية)", layer: "property", access: "internal", licence: "Sample data", homepage: "", cadenceDays: null,
    coverage: "Registered sales, signed contracts and asking prices, each labelled, with payment terms and date.", coverageAr: "بيوع مسجلة وعقود موقعة وأسعار معروضة، كل منها موسوم، مع شروط السداد والتاريخ.",
    note: "Sample data standing in for permissioned transaction and listing data.", noteAr: "بيانات تجريبية بديلة عن بيانات المعاملات والعروض المرخصة." },
  { id: "operating", name: "Owner-reported operating data", nameAr: "بيانات التشغيل من المالك", layer: "property", access: "internal", licence: "The portfolio's own records", homepage: "", cadenceDays: null,
    coverage: "Leases, rent collection, maintenance costs, budgets and instalments recorded in this platform.", coverageAr: "العقود وتحصيل الإيجار وتكاليف الصيانة والموازنات والأقساط المسجلة في هذه المنصة.",
    note: "First-party data: over time the most direct evidence for portfolio decisions.", noteAr: "بيانات الطرف الأول: مع الوقت هي أكثر الأدلة مباشرة لقرارات المحفظة." },
  { id: "egypt_mls", name: "Egypt MLS / official property platform", nameAr: "Egypt MLS / المنصة العقارية الرسمية", layer: "property", access: "partnership", licence: "Proprietary: needs a data agreement", homepage: "https://realestate.gov.eg/en/terms-and-conditions", cadenceDays: null,
    coverage: "Verified listing inventory, developer and brokerage data.", coverageAr: "مخزون عروض موثق وبيانات المطورين والوسطاء.",
    note: "No public API found. Listings may be incomplete or out of date; they would be stored as evidence with source and time, after a formal agreement.", noteAr: "لم نجد واجهة عامة. قد تكون العروض ناقصة أو قديمة؛ وتُحفظ كأدلة بمصدرها ووقتها بعد اتفاق رسمي." },
  { id: "nuca", name: "NUCA and GOPP planning records", nameAr: "سجلات هيئة المجتمعات العمرانية الجديدة والتخطيط العمراني", layer: "property", access: "partnership", licence: "Needs an agreement", homepage: "https://www.nuca-services.gov.eg/", cadenceDays: null,
    coverage: "New-city plans, land offerings and building-permit processes.", coverageAr: "مخططات المدن الجديدة وطرح الأراضي وإجراءات تراخيص البناء.", note: "No public general-purpose API found: a partnership conversation.", noteAr: "لا توجد واجهة عامة: موضوع شراكة." },
];

/** World Bank indicators imported for Egypt, with how each is labelled and measured. */
export const WB_INDICATORS: { id: string; label: string; unit: string; currency?: string }[] = [
  { id: "SP.POP.TOTL", label: "Population", unit: "people" },
  { id: "SP.URB.TOTL.IN.ZS", label: "Urban population share", unit: "%" },
  { id: "NY.GDP.MKTP.KD.ZG", label: "GDP growth", unit: "% a year" },
  { id: "FP.CPI.TOTL.ZG", label: "Inflation, consumer prices", unit: "% a year" },
  { id: "FP.CPI.TOTL", label: "Consumer price index (2010 = 100)", unit: "index" },
  { id: "PA.NUS.FCRF", label: "Official exchange rate", unit: "EGP per USD", currency: "EGP" },
  { id: "FR.INR.LEND", label: "Lending interest rate", unit: "%" },
];

/** Freshness from the last import and the expected cadence. */
export function freshness(lastImportAt: Date | null, cadenceDays: number | null, now: Date): "fresh" | "due" | "stale" | "never" | "na" {
  if (cadenceDays === null) return "na";
  if (!lastImportAt) return "never";
  const days = (now.getTime() - lastImportAt.getTime()) / 86400000;
  return days <= cadenceDays ? "fresh" : days <= cadenceDays * 2 ? "due" : "stale";
}
