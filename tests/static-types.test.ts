import { LeanWriter } from "../src/preservation.js";

const writer = new LeanWriter();
writer.literal`literal`;
writer.literalLine`literal-line`;

const dynamic: string = Math.random() > 2 ? "a" : "b";
// @ts-expect-error static output cannot interpolate runtime strings
writer.literal`${dynamic}`;
// @ts-expect-error static line output cannot interpolate runtime strings
writer.literalLine`${dynamic}`;
