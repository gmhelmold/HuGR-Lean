import { LeanWriter } from "../src/preservation.js";

const writer = new LeanWriter();
writer.staticText("literal");
writer.staticLine("literal-line");

const dynamic: string = Math.random() > 2 ? "a" : "b";
// @ts-expect-error runtime strings cannot use staticText
writer.staticText(dynamic);
// @ts-expect-error runtime strings cannot use staticLine
writer.staticLine(dynamic);
