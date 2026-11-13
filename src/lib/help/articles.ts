import { normaliseDigits } from "../horus/validate";

/**
 * The help knowledge base. The help bot (signed in) and the public chatbot (sign-in page) answer only from these
 * articles, so they can never state something the product does not do. `public` articles are safe for visitors;
 * the rest describe the inside of the app. `terms` are extra search words (both languages) that point to an article.
 */
export interface HelpArticle {
  id: string;
  public: boolean;
  title: { en: string; ar: string };
  body: { en: string; ar: string };
  terms: string;
  href?: string;
}

export const ARTICLES: HelpArticle[] = [
  {
    id: "what-is", public: true, terms: "what is about product zmnhoof os overview who for family office wealth manager ما هو المنتج النظام زمنهوف لمن",
    title: { en: "What ZMNHOOF OS is", ar: "ما هو ZMNHOOF OS" },
    body: {
      en: "ZMNHOOF OS is a real estate portfolio system for Cairo wealth managers and family offices. It keeps every asset, lease, document and valuation in one place, explains every number it shows, and records every decision in a tamper-evident audit chain. Its assistant, Horus, answers questions from the portfolio's own data and cites the record behind each answer.",
      ar: "ZMNHOOF OS نظام لإدارة محافظ العقارات لمديري الثروات والمكاتب العائلية في القاهرة. يجمع كل أصل وعقد إيجار ومستند وتقييم في مكان واحد، ويشرح كل رقم يعرضه، ويسجل كل قرار في سجل تدقيق مقاوم للتلاعب. مساعده حورس يجيب عن الأسئلة من بيانات المحفظة نفسها ويستشهد بالسجل وراء كل إجابة.",
    },
  },
  {
    id: "roles", public: true, terms: "roles role investor investors manager admin administrator access permissions who can see الأدوار دور مستثمر المستثمر مدير مسؤول صلاحيات يرى",
    title: { en: "Roles and what each can see", ar: "الأدوار وما يراه كل دور" },
    body: {
      en: "There are three roles. An investor sees the portfolio, assets, valuations and market, but not rent or costs. A manager sees everything financial, confirms valuations and drafts investor updates. The administrator runs governance: roles, the audit chain and security, and never sees financial content. The Governance page lists every permission by role.",
      ar: "هناك ثلاثة أدوار. يرى المستثمر المحفظة والأصول والتقييمات والسوق، دون الإيجارات أو التكاليف. يرى المدير كل المحتوى المالي، ويعتمد التقييمات، ويصوغ مستجدات المستثمرين. يتولى المسؤول الحوكمة: الأدوار وسجل التدقيق والأمان، ولا يرى المحتوى المالي أبدًا. تعرض صفحة الحوكمة كل صلاحية حسب الدور.",
    },
    href: "/governance",
  },
  {
    id: "demo-data", public: true, terms: "demo sample synthetic data real fake test trial البيانات تجريبية عرض حقيقية",
    title: { en: "Sample data in this demo", ar: "البيانات التجريبية في هذا العرض" },
    body: {
      en: "This is a concept demo. Every asset, tenant, price and market figure is synthetic sample data, and no email leaves the server. A production setup would connect your own records and published market sources.",
      ar: "هذا عرض مفاهيمي. كل الأصول والمستأجرين والأسعار وأرقام السوق بيانات تجريبية مصطنعة، ولا يغادر أي بريد إلكتروني الخادم. في الإعداد الفعلي تُربط سجلاتك ومصادر السوق المنشورة.",
    },
  },
  {
    id: "access", public: true, terms: "access sign up get account pricing price cost demo request trial contact buy subscribe الحصول على حساب سعر تكلفة طلب عرض تواصل اشتراك",
    title: { en: "Getting access", ar: "الحصول على الوصول" },
    body: {
      en: "To see ZMNHOOF OS with your own portfolio, request a demo from this chat: leave your name and email and the team will contact you. Pricing depends on portfolio size and is discussed in that call. In this demo you can enter as any of the sample users to explore.",
      ar: "لرؤية ZMNHOOF OS مع محفظتك، اطلب عرضًا من هذه المحادثة: اترك اسمك وبريدك وسيتواصل معك الفريق. يعتمد السعر على حجم المحفظة ويُناقش في تلك المكالمة. في هذا العرض يمكنك الدخول بأي مستخدم تجريبي للاستكشاف.",
    },
  },
  {
    id: "security", public: true, terms: "security secure privacy safe protected audit chain tamper data protection الأمان أمن آمنة الخصوصية حماية تحمى يحمي البيانات سجل التدقيق تلاعب",
    title: { en: "Security and the audit chain", ar: "الأمان وسجل التدقيق" },
    body: {
      en: "Every change is written to an append-only audit chain where each event carries the hash of the one before, so any edit to history is detected when the chain is verified. Database rows are protected by row-level security per role. Investor packs carry a verification hash that can be checked later on the Governance page.",
      ar: "يُكتب كل تغيير في سجل تدقيق للإلحاق فقط يحمل فيه كل حدث بصمة الحدث السابق، فيُكتشف أي تعديل على التاريخ عند التحقق من السلسلة. صفوف قاعدة البيانات محمية بأمان على مستوى الصف لكل دور. وتحمل حزم المستثمرين بصمة تحقق يمكن فحصها لاحقًا في صفحة الحوكمة.",
    },
    href: "/governance",
  },
  {
    id: "horus", public: true, terms: "horus ai assistant chat ask question citations advice حورس الذكاء الاصطناعي مساعد سؤال استشهاد نصيحة",
    title: { en: "Horus, the assistant", ar: "حورس، المساعد" },
    body: {
      en: "Horus answers questions about your portfolio using the same calculations the app shows, and cites the record behind every claim; open a citation to see the exact row. It does not give investment advice or predictions: AI informs, you decide. It can prepare actions, such as snoozing an alert or drafting an email, that a person must confirm.",
      ar: "يجيب حورس عن أسئلة محفظتك باستخدام الحسابات نفسها التي يعرضها التطبيق، ويستشهد بالسجل وراء كل معلومة؛ افتح الاستشهاد لترى الصف نفسه. لا يقدم نصائح استثمارية أو تنبؤات: الذكاء الاصطناعي يُعلم وأنت تقرر. ويمكنه تجهيز إجراءات، مثل تأجيل تنبيه أو صياغة بريد، يجب أن يؤكدها شخص.",
    },
  },
  {
    id: "valuation", public: false, terms: "valuation value estimate run comparables drivers approve two approvals adjustment التقييم تقييم تقدير مقارنات محركات اعتماد أعتمد يعتمد اعتمد موافقتين موافقة تعديل",
    title: { en: "Running and approving a valuation", ar: "إجراء التقييم واعتماده" },
    body: {
      en: "On Valuation, pick an asset or enter its facts and run the model. It shows the estimate, each driver's effect, a range and five comparable sales. You may adjust the final value with a reason, then send it for review. A different manager approves it; an adjustment above 10% needs two approvals. Nobody decides something they proposed.",
      ar: "في صفحة التقييم اختر أصلًا أو أدخل بياناته وشغّل النموذج. يعرض التقدير وأثر كل محرك ونطاقًا وخمس صفقات مقارنة. يمكنك تعديل القيمة النهائية مع ذكر السبب، ثم إرسالها للمراجعة. يعتمدها مدير آخر؛ والتعديل الذي يتجاوز 10% يحتاج موافقتين. لا أحد يقرر ما اقترحه بنفسه.",
    },
    href: "/valuation",
  },
  {
    id: "alerts", public: false, terms: "alerts attention bell snooze reopen notifications التنبيهات الجرس تأجيل إعادة فتح يحتاج انتباه",
    title: { en: "Alerts and snoozing", ar: "التنبيهات والتأجيل" },
    body: {
      en: "The bell and Overview show what needs attention: leases ending, missing documents, valuation drift and vacancy cost. Open an alert to see the asset, or snooze it with a reason; snoozed alerts stay listed and can be reopened. Every snooze is recorded in the audit chain.",
      ar: "يعرض الجرس وصفحة النظرة العامة ما يحتاج انتباهًا: عقود تنتهي ومستندات ناقصة وانحراف التقييم وتكلفة الشغور. افتح التنبيه لترى الأصل، أو أجّله مع ذكر السبب؛ تبقى التنبيهات المؤجلة ظاهرة ويمكن إعادة فتحها. يُسجّل كل تأجيل في سجل التدقيق.",
    },
    href: "/overview/alerts",
  },
  {
    id: "documents", public: false, terms: "documents upload lease deed extract read pdf expiring missing المستندات رفع عقد سند استخراج قراءة ناقص",
    title: { en: "Documents and reading a lease", ar: "المستندات وقراءة عقد الإيجار" },
    body: {
      en: "Asset documents lists every lease, title deed and insurance record with its status and expiry. Upload a sample lease or deed to have its fields read; you check each field against the source line before confirming. You can also attach a PDF in Horus and ask questions about it.",
      ar: "تعرض صفحة مستندات الأصول كل عقد إيجار وسند ملكية وتأمين مع حالته وتاريخ انتهائه. ارفع عقدًا أو سندًا تجريبيًا لقراءة حقوله؛ تراجع كل حقل مقابل سطر المصدر قبل التأكيد. ويمكنك أيضًا إرفاق ملف PDF في حورس والسؤال عنه.",
    },
    href: "/asset/documents",
  },
  {
    id: "leases", public: false, terms: "leases tenants rent arrears overdue collection payment record reminder renewal renew offer العقود المستأجرون الإيجار متأخرات تحصيل دفعة تذكير تجديد عرض",
    title: { en: "Tenants, rent and renewals", ar: "المستأجرون والإيجار والتجديدات" },
    body: {
      en: "Leases shows every tenant, their leases and whether their rent is up to date. Managers see Rent collection: this month's collection rate, overdue rent by age, and each unpaid invoice, where they record a payment or send a reminder (at most one a week). Renewals lists leases ending within 180 days by stage, from not started to agreed or leaving; managers record the offer, the proposed rent and the new end date. Investors see tenants, dates and stages, never amounts.",
      ar: "تعرض صفحة العقود كل مستأجر وعقوده وما إذا كان إيجاره مسددًا. يرى المديرون تحصيل الإيجار: نسبة تحصيل هذا الشهر، والإيجار المتأخر حسب العمر، وكل فاتورة غير مسددة، حيث يسجلون دفعة أو يرسلون تذكيرًا (مرة في الأسبوع على الأكثر). وتعرض التجديدات العقود التي تنتهي خلال 180 يومًا حسب المرحلة، من لم يبدأ إلى تم الاتفاق أو المغادرة؛ ويسجل المديرون العرض والإيجار المقترح وتاريخ الانتهاء الجديد. يرى المستثمرون المستأجرين والتواريخ والمراحل دون أي مبالغ.",
    },
    href: "/leases",
  },
  {
    id: "finance", public: false, terms: "finance cash flow ledger budget actual variance forecast noi net operating income distribution payout expense cost entry المالية التدفق النقدي الدفتر الموازنة الفعلي توقع صافي الدخل التشغيلي توزيع مصروفات بند",
    title: { en: "Cash flow, budget and distributions", ar: "التدفق النقدي والموازنة والتوزيعات" },
    body: {
      en: "Finance shows managers income, costs and net operating income for the last twelve months, a twelve-month forecast built from the leases and their renewals, the year against budget by category, and the ledger, where a manager adds a line by hand (lines are never edited; a correction is a new line). Each quarter a manager proposes a distribution, at most the quarter's net operating income; a different manager approves it on Alerts and approvals, then it is marked paid. Investors see their distributions only.",
      ar: "تعرض صفحة المالية للمديرين الدخل والتكاليف وصافي الدخل التشغيلي لآخر اثني عشر شهرًا، وتوقعًا لاثني عشر شهرًا مبنيًا على العقود وتجديداتها، والعام مقارنة بالموازنة حسب الفئة، ودفتر الأستاذ حيث يضيف المدير بندًا يدويًا (لا تُعدَّل البنود؛ التصحيح بند جديد). وفي كل ربع يقترح مدير توزيعًا لا يتجاوز صافي الدخل التشغيلي للربع، ويعتمده مدير آخر في صفحة التنبيهات والموافقات، ثم يُحدد كمدفوع. ويرى المستثمرون توزيعاتهم فقط.",
    },
    href: "/finance",
  },
  {
    id: "maintenance", public: false, terms: "maintenance repair work order task board report problem leak broken contractor assign due overdue الصيانة إصلاح أمر عمل مهمة لوحة بلاغ مشكلة تسريب عطل مقاول إسناد متأخر",
    title: { en: "Maintenance and tasks", ar: "الصيانة والمهام" },
    body: {
      en: "Maintenance shows every repair and team task on a board: to do, in progress, on hold and done. Anyone who can see an asset can report a problem from the board or the asset's page. Managers set the priority, assign it, give it a due date and an estimate, and move it along; overdue work is outlined in red. Marking a repair done with its actual cost writes that cost to the finance ledger. Every work order keeps a timeline of changes and notes.",
      ar: "تعرض صفحة الصيانة كل إصلاح ومهمة للفريق على لوحة: للتنفيذ وقيد التنفيذ ومعلقة ومنجزة. يمكن لكل من يرى الأصل أن يبلغ عن مشكلة من اللوحة أو من صفحة الأصل. ويحدد المديرون الأولوية ويسندون المهمة ويضعون تاريخ استحقاق وتكلفة تقديرية وينقلونها بين المراحل؛ والأعمال المتأخرة محاطة بالأحمر. وتحديد الإصلاح كمنجز بتكلفته الفعلية يسجل التكلفة في دفتر الأستاذ المالي. ولكل أمر عمل سجل زمني للتغييرات والملاحظات.",
    },
    href: "/maintenance",
  },
  {
    id: "reports", public: false, terms: "reports export download excel csv xlsx spreadsheet statement pdf schedule scheduled monthly quarterly التقارير تصدير تنزيل إكسل جدول بيانات كشف مجدول شهري ربع سنوي",
    title: { en: "Reports, exports and statements", ar: "التقارير والتصدير والكشوف" },
    body: {
      en: "Reports lets you download what you can see as Excel or CSV: holdings, leases, work orders and distributions, and for managers also unpaid rent, the ledger and the budget. Investor statements are PDFs of the portfolio for the year or a quarter, never showing a single asset's rent or costs. Managers can schedule a workbook or statement each month or quarter; investor workbooks are always built with the investor's permissions. Every download and report is recorded in the audit chain.",
      ar: "تتيح صفحة التقارير تنزيل ما تراه بصيغة Excel أو CSV: الأصول والعقود وأوامر العمل والتوزيعات، وللمديرين أيضًا الإيجار غير المسدد ودفتر الأستاذ والموازنة. وكشوف المستثمر ملفات PDF للمحفظة عن العام أو الربع، لا تعرض إيجار أو تكاليف أصل منفرد. ويمكن للمديرين جدولة ملف أو كشف كل شهر أو ربع؛ وملفات المستثمر تُبنى دائمًا بصلاحياته. ويُسجَّل كل تنزيل وتقرير في سجل التدقيق.",
    },
    href: "/reports",
  },
  {
    id: "notifications", public: false, terms: "notifications notify inbox unread email alerts settings preferences mute الإشعارات إشعار الوارد غير مقروء بريد إعدادات تفضيلات",
    title: { en: "Notifications", ar: "الإشعارات" },
    body: {
      en: "The inbox icon in the top bar shows how many notifications you have not read. You are told when something waits for your approval, when a decision is made on what you proposed, when work is assigned to you or finished, when a distribution is paid, when a scheduled report is ready, and about new demo requests. Under Notifications, Settings, choose for each kind whether it appears in the app, is emailed to you, or both.",
      ar: "تعرض أيقونة الوارد في الشريط العلوي عدد الإشعارات غير المقروءة. تُبلَّغ عندما ينتظر شيء موافقتك، وعند البت فيما اقترحته، وعند إسناد عمل إليك أو إنجازه، وعند دفع توزيع، وعندما يجهز تقرير مجدول، وبطلبات العرض الجديدة. ومن الإشعارات ثم الإعدادات، اختر لكل نوع أن يظهر في التطبيق أو يُرسل إليك بالبريد أو كليهما.",
    },
    href: "/notifications",
  },
  {
    id: "scenarios", public: false, terms: "scenarios stress test what if rates vacancy sliders sensitivity السيناريوهات اختبار ضغط ماذا لو أسعار شغور",
    title: { en: "Scenarios", ar: "السيناريوهات" },
    body: {
      en: "Scenarios stress the portfolio: move the sliders for price change, rent change, vacancy and the exchange rate, and see the effect on value and income for each asset. Managers can save a scenario; a saved scenario can be reproduced later with the same result hash.",
      ar: "تختبر السيناريوهات المحفظة تحت الضغط: حرّك أشرطة تغير السعر والإيجار والشغور وسعر الصرف، وشاهد الأثر على القيمة والدخل لكل أصل. يمكن للمديرين حفظ السيناريو، ويمكن إعادة إنتاجه لاحقًا بنفس بصمة النتيجة.",
    },
    href: "/portfolio/scenarios",
  },
  {
    id: "pack", public: false, terms: "investor pack pdf report download export verify hash حزمة المستثمر تقرير تنزيل تصدير تحقق",
    title: { en: "The investor pack", ar: "حزمة المستثمر" },
    body: {
      en: "On Portfolio, generate the investor pack: a PDF of the portfolio in English or Arabic with an audit appendix. Its verification hash can be pasted on Governance later to prove the pack matches the records at the time it was made.",
      ar: "من صفحة المحفظة أنشئ حزمة المستثمر: ملف PDF للمحفظة بالعربية أو الإنجليزية مع ملحق تدقيق. يمكن لصق بصمة التحقق الخاصة بها في صفحة الحوكمة لاحقًا لإثبات مطابقة الحزمة للسجلات وقت إنشائها.",
    },
    href: "/portfolio",
  },
  {
    id: "numbers", public: false, terms: "number figure traceable dotted underline source calculation where from how calculated الرقم مصدر حساب كيف حسب خط منقط",
    title: { en: "Where a number comes from", ar: "من أين يأتي الرقم" },
    body: {
      en: "Figures with a dotted underline are traceable: select one to see its source, how it is calculated and the assumptions behind it. Horus's citation chips work the same way for each claim it makes.",
      ar: "الأرقام ذات الخط المنقط قابلة للتتبع: اخترها لترى مصدرها وطريقة حسابها والافتراضات وراءها. وتعمل رقائق الاستشهاد في حورس بالطريقة نفسها لكل معلومة يذكرها.",
    },
  },
  {
    id: "search", public: false, terms: "search command bar shortcut keyboard ctrl k find quick بحث شريط الأوامر اختصار لوحة المفاتيح",
    title: { en: "Search and shortcuts", ar: "البحث والاختصارات" },
    body: {
      en: "Press Ctrl K (or Cmd K) to open the command bar: find an asset, district or document, switch currency or language, or send the text to Horus. Typos are tolerated.",
      ar: "اضغط Ctrl K (أو Cmd K) لفتح شريط الأوامر: ابحث عن أصل أو حي أو مستند، أو بدّل العملة أو اللغة، أو أرسل النص إلى حورس. الأخطاء الإملائية مقبولة.",
    },
  },
  {
    id: "currency-language", public: true, terms: "currency usd egp dollar pound exchange rate language arabic english switch العملة دولار جنيه سعر الصرف اللغة عربي إنجليزي",
    title: { en: "Currency and language", ar: "العملة واللغة" },
    body: {
      en: "Every page works in English and Arabic, right to left. Values show in Egyptian pounds or US dollars; switching converts at the sample exchange rate shown next to the toggle.",
      ar: "كل صفحة تعمل بالعربية والإنجليزية ومن اليمين إلى اليسار. تظهر القيم بالجنيه المصري أو الدولار الأمريكي؛ ويحوّل التبديل بسعر الصرف التجريبي الظاهر بجوار الزر.",
    },
  },
];

const AR_FOLD: [RegExp, string][] = [[/[أإآ]/g, "ا"], [/ة/g, "ه"], [/ى/g, "ي"], [/[ً-ْـ]/g, ""]];
const fold = (s: string) => AR_FOLD.reduce((x, [re, to]) => x.replace(re, to), normaliseDigits(s).toLowerCase());
// Light Arabic stemming: drop the article and attached prepositions, and common endings, so تقييمًا matches التقييم.
const stem = (w: string) => (/[\u0600-\u06FF]/.test(w) ? w.replace(/^(وال|بال|فال|كال|لل|ال)(?=..)/, "").replace(/(ات|ها|ه|ا|ي)$/, "") : w);
const words = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1).map(stem).filter((w) => w.length > 1);
const STOP = new Set(["the", "is", "a", "an", "of", "to", "in", "and", "or", "how", "do", "i", "can", "what", "does", "my", "it", "for", "on", "me", "you", "هل", "ما", "كيف", "في", "من", "على", "عن", "الى", "او"]);

/** Rank articles for a question by shared words (prefix match, both languages). Returns the best few with a score. */
export function searchHelp(question: string, opts: { publicOnly?: boolean; limit?: number } = {}): { article: HelpArticle; score: number }[] {
  const q = words(question).filter((w) => !STOP.has(w));
  if (!q.length) return [];
  const scored = ARTICLES.filter((a) => !opts.publicOnly || a.public).map((a) => {
    const hay = words(`${a.terms} ${a.title.en} ${a.title.ar}`);
    const body = words(`${a.body.en} ${a.body.ar}`);
    let score = 0;
    for (const w of q) {
      if (hay.some((h) => h.startsWith(w) || (w.length > 3 && w.startsWith(h)))) score += 3;
      else if (body.some((h) => h.startsWith(w))) score += 1;
    }
    return { article: a, score };
  });
  // An article counts only when a question word hits its topic terms or title (score 3+), not just its body text.
  return scored.filter((s) => s.score >= 3).sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 3);
}

export const articleById = (id: string) => ARTICLES.find((a) => a.id === id) ?? null;
