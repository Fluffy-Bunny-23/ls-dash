/** Seed the Firestore emulator with truthful dev data (§9).
 *
 * Every value mirrors a verified source: ABC days + UIDs from the live
 * `calendar_436.ics` feed, lunch/breakfast names from `ref/Sage*.har`
 * (normalized as the extractor does), daily offerings from live single-day
 * `getMenuItems` calls. The only synthetic doc is the Saturday one, which
 * exists solely to prove weekends are never navigable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import admin from "firebase-admin";

function loadEnv(path: string): void {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch {
    /* no .env.local — rely on the environment */
  }
}

loadEnv(join(process.cwd(), ".env.local"));

admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-school-dash" });
const db = admin.firestore();

// `Daily`-meal offerings (daily platter, beverages, accompaniments) — the
// category only appears in single-day `getMenuItems` payloads (see
// `src/lib/__fixtures__/sage-single-0908-breakfast.json`). DAILY_0908 is
// captured from that 09-08 payload; 09-09/09-10 reuse it and DAILY_0911 is
// the Friday set from the same live probe. Re-capture if Sage rotates items.
const DAILY_0908 = [
  "Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard",
  "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice",
  "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa",
  "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice",
  "Salted Butter",
];
const DAILY_0911 = [
  "House-Made Ranch Dressing", "Milk (2%)", "Mustard", "Ketchup",
  "Salted Butter", "Cream Cheese", "Hot Sauce", "Gluten-Free Soy Sauce",
  "Lemonade", "Fruit Punch", "Spa Water", "Chocolate Milk (1%)",
  "Caesar Dressing", "Assorted Breads", "Toasted Sunflower Seeds",
  "French Fried Onions", "Plain Croutons", "Roasted Pumpkin Seeds",
  "Sweetened Dried Cranberries", "Thousand Island Dressing",
  "House-Made Balsamic Dressing", "Creamy Italian Dressing", "Mayonnaise",
];

function emptyLunch() {
  return { entree: null, special: null, feature: null, soups: [], sides: [], all: [] };
}
function emptyBreakfast() {
  return { entree: null, all: [], daily: [] };
}

async function main(): Promise<void> {
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  const docs: Record<string, Record<string, unknown>> = {
    // Mon 09-07: absent from the ICS feed = no school; label from Sage monthly events.
    "2026-09-07": {
      date: "2026-09-07", dow: "Mon", abc: null, isSpecial: false, specialLabel: null,
      isNoSchool: true, noSchoolLabel: "Labor Day",
      lunch: emptyLunch(), breakfast: emptyBreakfast(),
      sources: { icalUid: null, sageWeek: "09/06/2026" }, updatedAt: stamp,
    },
    // Tue 09-08: MS A day (UID 12485791), HAR lunch + breakfast + live dailies.
    "2026-09-08": {
      date: "2026-09-08", dow: "Tue", abc: "A", isSpecial: false, specialLabel: null,
      isNoSchool: false, noSchoolLabel: null,
      lunch: {
        entree: "Italian-Roasted Pork Loin", special: "Pho Bar", feature: null,
        soups: ["Chicken Pho Soup", "Vegan Miso Soup"],
        sides: ["Tater Tots", "Steamed Broccoli"],
        all: ["Italian-Roasted Pork Loin", "Pho Bar", "Sloppy Joes"],
      },
      breakfast: {
        entree: "Grilled Ham",
        all: ["Grilled Ham", "Cheddar Scrambled Eggs", "Bagel & Cream Cheese"],
        daily: DAILY_0908,
      },
      sources: { icalUid: "12485791@www.example-school.org", sageWeek: "09/06/2026" }, updatedAt: stamp,
    },
    // Wed 09-09: MS B day (UID 12485794), HAR lunch + breakfast + live dailies.
    "2026-09-09": {
      date: "2026-09-09", dow: "Wed", abc: "B", isSpecial: false, specialLabel: null,
      isNoSchool: false, noSchoolLabel: null,
      lunch: {
        entree: "Fajita Chicken Breast", special: "Taco Bar", feature: "Cuisine from Mexico",
        soups: ["Creamy Tomato-Basil Soup"], sides: ["Mexican Rice with Stewed Tomatoes"],
        all: ["Fajita Chicken Breast", "Taco Bar", "Cuisine from Mexico"],
      },
      breakfast: {
        entree: "Bacon",
        all: ["Bacon", "Lions Cucumber Shakers", "Sticky Rice", "Pineapple Cup"],
        daily: DAILY_0908,
      },
      sources: { icalUid: "12485794@www.example-school.org", sageWeek: "09/06/2026" }, updatedAt: stamp,
    },
    // Thu 09-10: MS C day (UID 12485796), HAR lunch + breakfast + live dailies.
    "2026-09-10": {
      date: "2026-09-10", dow: "Thu", abc: "C", isSpecial: false, specialLabel: null,
      isNoSchool: false, noSchoolLabel: null,
      lunch: {
        entree: "Vegetarian Red Beans and Rice", special: "Build- Your -Own Bao Bar", feature: null,
        soups: ["Beef Chili", "Vegetarian Chili"], sides: ["Steamed Corn", "Sweet Potato Fries"],
        all: ["Vegetarian Red Beans and Rice", "Build- Your -Own Bao Bar", "Mac & Cheese"],
      },
      breakfast: {
        entree: "Bacon",
        all: ["Bacon", "Breakfast Sausage Links", "Bagel & Cream Cheese"],
        daily: DAILY_0908,
      },
      sources: { icalUid: "12485796@www.example-school.org", sageWeek: "09/06/2026" }, updatedAt: stamp,
    },
    // Fri 09-11: MS A day (UID 12485798), HAR lunch + breakfast + live dailies.
    "2026-09-11": {
      date: "2026-09-11", dow: "Fri", abc: "A", isSpecial: false, specialLabel: null,
      isNoSchool: false, noSchoolLabel: null,
      lunch: {
        entree: "House-Roasted Cajun Chicken Thigh", special: "Build-Your-Own Burger Bar",
        feature: "Cantonese Cuisine From China",
        soups: ["Loaded Baked Potato Soup"], sides: ["Sticky Rice"],
        all: ["House-Roasted Cajun Chicken Thigh", "Build-Your-Own Burger Bar"],
      },
      breakfast: {
        entree: "Grilled Ham",
        all: ["Grilled Ham", "Greek Scrambled Eggs"],
        daily: DAILY_0911,
      },
      sources: { icalUid: "12485798@www.example-school.org", sageWeek: "09/06/2026" }, updatedAt: stamp,
    },
    // Sat 09-12: SYNTHETIC weekend doc — must never be navigable/rendered.
    "2026-09-12": {
      date: "2026-09-12", dow: "Sat", abc: null, isSpecial: false, specialLabel: null,
      isNoSchool: false, noSchoolLabel: null,
      lunch: emptyLunch(), breakfast: emptyBreakfast(),
      sources: { icalUid: null, sageWeek: "09/06/2026" }, updatedAt: stamp,
    },
    // Wed 10-14: REAL special day from the live feed (UID 12485878). No HAR
    // fixtures cover October, so menus are empty — the special rendering is
    // what this doc exercises.
    "2026-10-14": {
      date: "2026-10-14", dow: "Wed", abc: "B", isSpecial: true,
      specialLabel: "MS special B day schedule",
      isNoSchool: false, noSchoolLabel: null,
      lunch: emptyLunch(), breakfast: emptyBreakfast(),
      sources: { icalUid: "12485878@www.example-school.org", sageWeek: null }, updatedAt: stamp,
    },
  };
  for (const [id, data] of Object.entries(docs)) {
    await db.collection("days").doc(id).set(data);
    console.log("seeded", id);
  }
  await db.collection("meta").doc("sync").set({
    lastSuccess: new Date().toISOString(),
    lastAttempt: new Date().toISOString(),
    datesWritten: Object.keys(docs).length,
    errors: [],
  });
  console.log("seeded meta/sync");
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
