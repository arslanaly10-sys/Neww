// Renders docs/architecture.md (title, a table, principles) into a one-page PDF with the demo's fonts.
import React from "react";
import { readFileSync } from "node:fs";
import { Document, Font, Page, StyleSheet, Text, View, renderToFile } from "@react-pdf/renderer";
const h = React.createElement;
const F = "assets/fonts/";
Font.register({ family: "Manrope", fonts: [{ src: F + "Manrope-400.woff" }, { src: F + "Manrope-600.woff", fontWeight: 600 }, { src: F + "Manrope-700.woff", fontWeight: 700 }] });
Font.register({ family: "Playfair", fonts: [{ src: F + "PlayfairDisplay-600.woff", fontWeight: 600 }] });

const md = readFileSync("docs/architecture.md", "utf8").split("\n");
const title = md.find((l) => l.startsWith("# "))?.slice(2) ?? "Architecture";
const rows = md.filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim().replace(/`/g, "")));
const [head, ...body] = rows;
const principles = md.filter((l) => l.startsWith("Principles:")).map((l) => l.replace(/^Principles:\s*/, ""))[0] ?? "";
const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Manrope", fontSize: 7.6, lineHeight: 1.35, color: "#14120e" },
  title: { fontFamily: "Playfair", fontSize: 18, fontWeight: 600, color: "#8a6a22", marginBottom: 3 },
  sub: { color: "#5b564a", marginBottom: 10 },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #d8cfba", paddingVertical: 3.5 },
  c1: { width: "14%", fontWeight: 700, paddingRight: 6 }, c2: { width: "40%", paddingRight: 8 }, c3: { width: "46%" },
  foot: { marginTop: 10, color: "#5b564a" },
});
const Row = ({ r, bold }) => h(View, { style: [s.row, bold ? { backgroundColor: "#f6f2e9" } : {}], wrap: false }, [s.c1, s.c2, s.c3].map((st, i) => h(Text, { key: i, style: [st, bold ? { fontWeight: 700, fontSize: 7 } : {}] }, r[i] ?? "")));
await renderToFile(
  h(Document, { title: "ZMNHOOF OS architecture note", author: "ZMNHOOF OS concept demo" },
    h(Page, { size: "A4", style: s.page },
      h(Text, { style: s.title }, title),
      h(Text, { style: s.sub }, "Concept demo with sample data. One page: each demo layer and its production equivalent."),
      h(Row, { r: head, bold: true }), ...body.map((r, i) => h(Row, { key: i, r })),
      h(Text, { style: s.foot }, principles))),
  "docs/architecture.pdf");
console.log("architecture.pdf written", body.length, "rows");
