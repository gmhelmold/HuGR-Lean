import type { Profile } from "../profile.js";
import { cargoProfiles } from "./cargo.js";
import { gitProfiles } from "./git.js";
import { goProfiles } from "./go.js";
import { jsTsProfiles } from "./js_ts.js";
import { pythonPytestProfiles } from "./pytest.js";
import { searchProfiles } from "./search.js";

export function v1Profiles(): Profile[] {
  return [
    ...cargoProfiles(),
    ...pythonPytestProfiles(),
    ...jsTsProfiles(),
    ...goProfiles(),
    ...gitProfiles(),
    ...searchProfiles(),
  ];
}
