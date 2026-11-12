// Generates the three bundled sample documents. All parties and data are fictional.
// Deliberate differences from the seeded records give the confirmation step something to catch.
import React from "react";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Document, Page, Text, View, Font, renderToFile, StyleSheet } from "@react-pdf/renderer";
const h = React.createElement;
const F = "assets/fonts/";
Font.register({ family: "Manrope", fonts: [{ src: F + "Manrope-400.woff" }, { src: F + "Manrope-700.woff", fontWeight: 700 }] });
Font.register({ family: "Playfair", fonts: [{ src: F + "PlayfairDisplay-400.woff" }, { src: F + "PlayfairDisplay-600.woff", fontWeight: 600 }] });
Font.register({ family: "Plex", fonts: [{ src: F + "IBMPlexSansArabic-400.woff" }, { src: F + "IBMPlexSansArabic-600.woff", fontWeight: 600 }] });
Font.register({ family: "Naskh", fonts: [{ src: F + "NotoNaskhArabic-400.woff" }, { src: F + "NotoNaskhArabic-600.woff", fontWeight: 600 }] });

const gold = "#8a6a22", ink = "#14120e", muted = "#5b564a";
const st = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 54, fontSize: 11, color: ink, lineHeight: 1.5 },
  stamp: { fontSize: 8, color: muted, borderBottom: "0.5pt solid #bbb", paddingBottom: 4, marginBottom: 18 },
  foot: { position: "absolute", bottom: 24, left: 54, right: 54, fontSize: 8, color: muted, borderTop: "0.5pt solid #bbb", paddingTop: 5 },
});
const en = (s) => ({ ...s, fontFamily: "Manrope" });
const ar = (s) => ({ ...s, fontFamily: "Plex", textAlign: "right" });
const Stamp = (rtl) => h(Text, { style: rtl ? ar(st.stamp) : en(st.stamp) }, rtl ? "مستند تجريبي. الأطراف والبيانات خيالية، وهذا ليس صكاً قانونياً." : "SAMPLE DOCUMENT. Fictional parties and data. Not a legal instrument.");
const Foot = (rtl) => h(Text, { style: rtl ? ar(st.foot) : en(st.foot), fixed: true }, "ZMNHOOF OS concept demo, sample data");
const L = (rtl, text, extra = {}) => h(Text, { style: { ...(rtl ? ar({}) : en({})), marginBottom: 4, ...extra } }, text);
const Title = (rtl, text) => h(Text, { style: rtl ? { fontFamily: "Naskh", fontSize: 24, fontWeight: 600, textAlign: "right", color: gold, marginBottom: 14 } : { fontFamily: "Playfair", fontSize: 22, fontWeight: 600, color: gold, marginBottom: 14 } }, text);
const Sub = (rtl, text) => h(Text, { style: rtl ? { ...ar({}), fontWeight: 600, marginTop: 12, marginBottom: 4, fontSize: 12 } : { ...en({}), fontWeight: 700, marginTop: 12, marginBottom: 4, fontSize: 12 } }, text);

const lease = (a) => [
  Title(false, "RESIDENTIAL LEASE AGREEMENT"),
  ...[`Lease reference: ${a.ref}`, `Landlord: ${a.landlord}`, `Tenant: ${a.tenant}`, `Premises: ${a.premises}`, `Area: ${a.area} sqm`,
    `Lease start date: ${a.start}`, `Lease end date: ${a.end}`, `Monthly rent: ${a.rent}`, `Annual indexation: ${a.index}%`, `Security deposit: ${a.deposit} months of rent`].map((t) => L(false, t)),
  Sub(false, "Terms"),
  ...a.clauses.map((c) => L(false, c)),
];
const leaseAr = (a) => [
  Title(true, "عقد إيجار سكني"),
  ...[`رقم العقد: ${a.ref}`, `المؤجر: ${a.landlord}`, `المستأجر: ${a.tenant}`, `العقار: ${a.premises}`, `المساحة: ${a.area} م²`,
    `تاريخ بدء الإيجار: ${a.startAr}`, `تاريخ انتهاء الإيجار: ${a.endAr}`, `الإيجار الشهري: ${a.rentAr}`, `الزيادة السنوية: ${a.indexAr}%`, `مبلغ التأمين: ${a.depositAr} أشهر من الإيجار`].map((t) => L(true, t)),
  Sub(true, "البنود"),
  ...a.clausesAr.map((c) => L(true, c)),
];

const docs = {
  "sample-lease-en.pdf": h(Document, { title: "Sample lease (English)", author: "ZMNHOOF OS demo" }, h(Page, { size: "A4", style: en(st.page) }, Stamp(false),
    ...lease({
      ref: "L-011", landlord: "Sample Family Office", tenant: "Sample Tenant A (family)", premises: "Palm Court 4B, Palm Court, New Cairo", area: 185,
      start: "1 September 2025", end: "31 August 2027", rent: "EGP 116,000", index: 10, deposit: 2,
      clauses: [
        "1. Early termination. The tenant may terminate early after the 12th month by giving 90 days' written notice.",
        "2. Renewal. Renewal is by mutual agreement of the parties.",
        "3. Subletting. The tenant shall not sublet the premises without the landlord's prior written consent.",
        "4. Governing law. This agreement is governed by Egyptian law and the Cairo courts have jurisdiction.",
      ],
    }), L(false, "Signed for the landlord: ______________      Signed for the tenant: ______________", { marginTop: 28, color: muted, fontSize: 9 }), Foot(false))),

  "sample-deed-ar.pdf": h(Document, { title: "Sample title deed (Arabic)", author: "ZMNHOOF OS demo" }, h(Page, { size: "A4", style: ar(st.page) }, Stamp(true),
    Title(true, "عقد ملكية عقار"),
    ...["رقم التسجيل: SR-2022-04417", "المالك: Sample Family Office", "الوحدة: Tagamoa Business Hub, Floor 6", "الحي: القاهرة الجديدة", "المساحة: 612 م²", "تاريخ التسجيل: 2022/06/20", "جهة التسجيل: الشهر العقاري، مكتب تجريبي"].map((t) => L(true, t)),
    L(true, "يشهد هذا العقد بأن الوحدة الموضحة أعلاه مسجلة باسم المالك المذكور، وهي خالية من أي حقوق عينية للغير.", { marginTop: 14, color: muted }),
    Foot(true))),

  "sample-lease-bilingual.pdf": h(Document, { title: "Sample lease (bilingual)", author: "ZMNHOOF OS demo" }, h(Page, { size: "A4", style: en(st.page) }, Stamp(false),
    ...lease({
      ref: "L-018", landlord: "Sample Family Office", tenant: "Sample Tenant H (expat family)", premises: "Corniche View 6A, Corniche View, Maadi", area: 210,
      start: "1 June 2025", end: "31 May 2027", rent: "EGP 143,000", index: 8, deposit: 3,
      clauses: [
        "1. Early termination. The tenant may terminate early after the 12th month by giving 90 days' written notice.",
        "2. Renewal. The tenant has a first right to renew on 60 days' notice.",
        "3. Subletting. The tenant shall not sublet the premises without the landlord's prior written consent.",
        "4. Governing law. This agreement is governed by Egyptian law and the Cairo courts have jurisdiction.",
      ],
    }), Foot(false)),
    h(Page, { size: "A4", style: ar(st.page) }, Stamp(true),
    ...leaseAr({
      ref: "L-018", landlord: "Sample Family Office", tenant: "Sample Tenant H (expat family)", premises: "Corniche View 6A, Corniche View, Maadi", area: 210,
      startAr: "2025/06/01", endAr: "2027/05/31", rentAr: "143,000 جنيه", indexAr: 9, depositAr: 3,
      clausesAr: [
        "1. الإنهاء المبكر. يحق للمستأجر إنهاء العقد بعد الشهر الثاني عشر بإخطار مكتوب قبل 90 يوماً.",
        "2. التجديد. للمستأجر أولوية التجديد بإخطار قبل 60 يوماً.",
        "3. التأجير من الباطن. لا يجوز للمستأجر التأجير من الباطن دون موافقة كتابية مسبقة من المؤجر.",
        "4. القانون الواجب التطبيق. يخضع هذا العقد للقانون المصري، وتختص به محاكم القاهرة.",
      ],
    }), Foot(true))),
};

const manifest = [];
for (const [file, doc] of Object.entries(docs)) {
  await renderToFile(doc, `public/samples/${file}`);
  manifest.push({ file, sha256: createHash("sha256").update(readFileSync(`public/samples/${file}`)).digest("hex") });
}
writeFileSync("public/samples/manifest.json", JSON.stringify(manifest, null, 2));
console.log(manifest);
