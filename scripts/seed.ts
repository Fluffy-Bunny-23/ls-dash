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

const PAWS_WEEK = "PAWS 9/21-9/25";
// Hand-supplied PAWS schedule for 09/21–09/25 from the school's PAWS table.
// In prod this lives in the `overrides/paws` doc (one field per date) and
// the cron bakes it into each day; the seed carries both so dev renders it.
const PAWS_0921_0925: Record<string, { title: string; details: string[] }> = {
  "2026-09-21": { title: "Academic Advisory", details: ["Advisory Locations"] },
  "2026-09-22": { title: "Assembly", details: ["Theater"] },
  "2026-09-23": {
    title: "Advisory / GSL Prep",
    details: ["5th: Advisory", "6th: Advisory", "7th: Advisory", "Advisory Locations", "8th: GSL Prep", "GSL Locations"],
  },
  "2026-09-24": {
    title: "All-School Study Hall",
    details: ["5th: MS 185", "6th: Theater", "7th: Off campus", "8th: Library"],
  },
  "2026-09-25": { title: "Advisory", details: ["Advisory Locations"] },
};

function schoolDay(
  id: string,
  dow: string,
  menus: { lunch: Record<string, unknown>; breakfast: Record<string, unknown> },
  paws: { title: string; details: string[] } | null,
  sageWeek: string,
) {
  return {
    date: id, dow, abc: null, isSpecial: false, specialLabel: null,
    isNoSchool: false, noSchoolLabel: null,
    lunch: menus.lunch, breakfast: menus.breakfast,
    paws: paws ? { ...paws, week: PAWS_WEEK } : null,
    sources: { icalUid: null, sageWeek }, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// LIVE Sage weeks of 09/14 + 09/21/2026, fetched 2026-09-18, extractor
// output verbatim (summary fields only — no per-item details captured).
// ABC is null throughout: the school feed URL is a placeholder in local
// dev, so no rotation is verifiable offline.
const LIVE_MENUS: Record<string, { lunch: Record<string, unknown>; breakfast: Record<string, unknown> }> = {
  "2026-09-15": {
    lunch: {
      entree: "Baked Chicken Thighs", special: "Middle School Pasta Bar", feature: null,
      soups: ["Broccoli-Cheddar Soup"],
      sides: ["Steamed White Rice", "Steamed Carrots", "Steamed Corn", "Steamed Basmati Rice"],
      all: ["Baked Chicken Thighs", "Barbecue Beef Brisket", "Barbecue Tofu", "Roast Beef Club Wrap", "Soynut Butter and Jelly on White Bread", "Middle School Pasta Bar", "Broccoli-Cheddar Soup", "Tarragon Chicken and Apple Salad", "Tomato Salad", "Chickpea and Fennel Salad", "House-Roasted Turkey", "Swiss Cheese", "Steamed White Rice", "Steamed Carrots", "Steamed Corn", "Steamed Basmati Rice", "Assorted Fresh-Cut Fruit", "Brownies"],
    },
    breakfast: {
      entree: "Grilled Ham",
      all: ["Grilled Ham", "Cheddar Scrambled Eggs", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Pineapple Cup", "Red Grapes Cup", "Strawberry Cup", "S'mores Pudding Parfait", "Strawberry Shortcake Parfait", "Banana Muffins"],
      daily: ["Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard", "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice", "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa", "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice", "Salted Butter"],
    },
  },
  "2026-09-16": {
    lunch: {
      entree: "Rotisserie-Seasoned Chicken Drumsticks", special: "Build- Your-Own Chicken Sandwich", feature: "Cuisine From Western India",
      soups: ["French Onion Soup"],
      sides: ["Steamed Basmati Rice", "Roasted Garlic Green Beans", "Roasted Potatoes", "Steamed Broccoli"],
      all: ["Rotisserie-Seasoned Chicken Drumsticks", "Pork Vindaloo", "Coconut Curry Chickpeas", "Buffalo Chicken Wrap", "Soynut Butter and Jelly on White Bread", "Build- Your-Own Chicken Sandwich", "Cuisine From Western India", "French Onion Soup", "Curried Egg Salad", "Italian Tortellini Salad", "Corn Salad", "Ham", "Provolone Cheese", "Steamed Basmati Rice", "Roasted Garlic Green Beans", "Roasted Potatoes", "Steamed Broccoli", "Assorted Fresh-Cut Fruit", "Yellow Cake with Whipped Cream Frosting"],
    },
    breakfast: {
      entree: "Bacon",
      all: ["Bacon", "Breakfast Sausage Patties", "Greek Scrambled Eggs", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Croissants", "Strawberry Cup", "Red Grapes Cup", "Pineapple Cup", "S'mores Pudding Parfait", "Strawberry Shortcake Parfait"],
      daily: ["Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard", "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice", "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa", "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice", "Salted Butter"],
    },
  },
  "2026-09-17": {
    lunch: {
      entree: "Herb-Rubbed Pork Loin", special: "Middle School Taco Toppings Bar", feature: null,
      soups: ["Beef Chili"],
      sides: ["Tajin Corn", "Paprika-Roasted Red Potatoes", "Steamed Peas", "Cilantro-Lime Rice", "White Rice", "Cuban Black Beans"],
      all: ["Herb-Rubbed Pork Loin", "Shredded Chicken Tinga", "Taco-Style Tofu", "BLT Wrap", "Soynut Butter and Jelly on White Bread", "Middle School Taco Toppings Bar", "Beef Chili", "Tofu and Kimchi Poke Salad", "Green Bean and Red Onion Salad", "Pepperoni", "Swiss Cheese", "White Bean Hummus", "Tajin Corn", "Paprika-Roasted Red Potatoes", "Steamed Peas", "Cilantro-Lime Rice", "White Rice", "Cuban Black Beans", "Honeydew", "Cantaloupe", "Baked Cinnamon Sugar Churros", "Chocolate Chip Cookies"],
    },
    breakfast: {
      entree: "Bacon",
      all: ["Bacon", "Breakfast Sausage Links", "Western Scrambled Eggs", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Red Grapes Cup", "Pineapple Cup", "Strawberry Cup", "S'mores Pudding Parfait", "Strawberry Shortcake Parfait", "Double Chocolate Chip Muffins"],
      daily: ["Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard", "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice", "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa", "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice", "Salted Butter"],
    },
  },
  "2026-09-18": {
    lunch: {
      entree: "House-Roasted Beef", special: "Grilled Cheese, Please!", feature: "Cuisine From Japan",
      soups: ["Tomato Soup"],
      sides: ["Sticky Rice", "Steamed Edamame", "Roasted Cauliflower", "Rosemary-Garlic Roasted Potatoes"],
      all: ["House-Roasted Beef", "Teriyaki Chicken Thighs (GF)", "Teriyaki Tofu", "Chicken Tender Wrap", "Soynut Butter and Jelly on White Bread", "Grilled Cheese, Please!", "Cuisine From Japan", "Tomato Soup", "Cajun Chicken Salad", "Edamame Salad", "Teriyaki Noodle Salad", "Genoa Salami", "Pepper Jack Cheese", "Sticky Rice", "Steamed Edamame", "Roasted Cauliflower", "Rosemary-Garlic Roasted Potatoes", "Assorted Fresh-Cut Fruit", "Chocolate Chip Blondies"],
    },
    breakfast: {
      entree: "Grilled Ham",
      all: ["Grilled Ham", "Greek Scrambled Eggs", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Pain au Chocolate", "Pineapple Cup", "Red Grapes Cup", "Strawberry Cup", "S'mores Pudding Parfait", "Strawberry Shortcake Parfait"],
      daily: ["Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard", "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice", "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa", "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice", "Salted Butter"],
    },
  },
  "2026-09-21": {
    lunch: {
      entree: "Herb-Rubbed Pork Loin", special: "Pho Bar", feature: null,
      soups: ["Chicken Pho Soup", "Vegan Miso Soup"],
      sides: ["Roasted Red Potatoes", "Steamed White Rice", "Steamed Peas", "Roasted Cauliflower", "Curried Chickpeas"],
      all: ["Herb-Rubbed Pork Loin", "Chicken Tikka Masala", "Ham and Cheddar Sub", "Soynut Butter and Jelly on White Bread", "Pho Bar", "Chicken Pho Soup", "Vegan Miso Soup", "Mint, Cucumber, and Yogurt Salad", "Indian Chickpea Salad", "Pepper Jack Cheese", "Roasted Red Pepper Hummus", "Roasted Red Potatoes", "Steamed White Rice", "Steamed Peas", "Roasted Cauliflower", "Curried Chickpeas", "Assorted Fresh-Cut Fruit", "Red Velvet Cookies"],
    },
    breakfast: {
      entree: "Bacon",
      all: ["Bacon", "Breakfast Sausage Patties", "Scrambled Eggs with Peppers and Onions", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Pain au Chocolate", "Pineapple Cup", "Red Grapes Cup", "Strawberry Cup", "Strawberry Shortcake Parfait", "Oreo® Chocolate Pudding Delight"],
      daily: ["Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard", "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice", "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa", "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice", "Salted Butter"],
    },
  },
  "2026-09-22": {
    lunch: {
      entree: "Beef and Potato Stew", special: "Middle School Pasta Bar", feature: null,
      soups: ["Split Pea Soup"],
      sides: ["Roasted Sweet Potatoes", "Red Skin Mashed Potatoes", "Chicken Gravy", "Steamed Corn", "Sautéed Green Beans"],
      all: ["Beef and Potato Stew", "Thyme-Roasted Chicken", "Baked Tofu", "Chicken Tender and Ranch Wrap", "Soynut Butter and Jelly on White Bread", "Middle School Pasta Bar", "Split Pea Soup", "Cranberry Chicken Salad", "Broccoli Salad with Citrus Vinaigrette", "Macaroni Salad", "Pepperoni", "Roasted Sweet Potatoes", "Red Skin Mashed Potatoes", "Chicken Gravy", "Steamed Corn", "Sautéed Green Beans", "Assorted Fresh-Cut Fruit", "Chocolate Cake with Chocolate Frosting"],
    },
    breakfast: {
      entree: "Grilled Ham",
      all: ["Grilled Ham", "Cheddar Scrambled Eggs", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Pineapple Cup", "Red Grapes Cup", "Strawberry Cup", "Strawberry Shortcake Parfait", "Oreo® Chocolate Pudding Delight", "House-Baked Assorted Muffins"],
      daily: ["Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard", "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice", "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa", "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice", "Salted Butter"],
    },
  },
  "2026-09-23": {
    lunch: {
      entree: "BBQ Chicken Drumsticks", special: "Baked Potato Bar", feature: null,
      soups: ["Beef Chili", "Slow-Simmered Black Bean Chili"],
      sides: ["Yellow Rice", "Steamed Broccoli", "Roasted Carrots and Shallots with Thyme"],
      all: ["BBQ Chicken Drumsticks", "BBQ Pulled Pork Sandwich", "Mac & Cheese", "Southwestern Black Beans and Quinoa", "Pastrami Bagel", "Soynut Butter and Jelly on White Bread", "Baked Potato Bar", "Beef Chili", "Slow-Simmered Black Bean Chili", "Curried Egg Salad", "Coleslaw", "Corn Salad", "Havarti Cheese", "Yellow Rice", "Steamed Broccoli", "Roasted Carrots and Shallots with Thyme", "Assorted Fresh-Cut Fruit", "Chocolate Chip Blondies"],
    },
    breakfast: {
      entree: "Bacon",
      all: ["Bacon", "Breakfast Sausage Patties", "Scrambled Eggs with Peppers and Onions", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Pain au Chocolate", "Red Grapes Cup", "Pineapple Cup", "Strawberry Cup", "Strawberry Shortcake Parfait", "Oreo® Chocolate Pudding Delight"],
      daily: ["Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard", "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice", "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa", "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice", "Salted Butter"],
    },
  },
  "2026-09-24": {
    lunch: {
      entree: "Greek Chicken", special: "Gyro Toppings Bar", feature: null,
      soups: ["Red Lentil Soup"],
      sides: ["Pita", "Rice Pilaf with Spinach", "Baked French Fries", "Roasted Zucchini", "Steamed Green Beans"],
      all: ["Greek Chicken", "Roasted Gyro Meat", "Falafel", "Chicken Banh Mi", "Soynut Butter and Jelly on White Bread", "Gyro Toppings Bar", "Educational Seasonings: An Abundance of Apples", "Red Lentil Soup", "Bulgur Tabbouleh", "Cajun Tuna Salad", "Tomato Salad", "Greek Cucumber Salad", "Capicola Ham", "Pita", "Rice Pilaf with Spinach", "Baked French Fries", "Roasted Zucchini", "Steamed Green Beans", "Assorted Fresh-Cut Fruit", "Cheesecake Bars"],
    },
    breakfast: {
      entree: "Bacon",
      all: ["Bacon", "Breakfast Sausage Links", "Cheddar Scrambled Eggs", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Pineapple Cup", "Red Grapes Cup", "Strawberry Cup", "Strawberry Shortcake Parfait", "Oreo® Chocolate Pudding Delight", "House-Baked Assorted Muffins"],
      daily: ["Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard", "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice", "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa", "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice", "Salted Butter"],
    },
  },
  "2026-09-25": {
    lunch: {
      entree: "Italian-Roasted Pork Loin", special: "Build- Your-Own Chicken Sandwich", feature: null,
      soups: ["French Onion Soup"],
      sides: ["Garlic-Roasted Potatoes", "Roasted Tomatoes", "Lemon-Garlic Sautéed Kale", "Steamed Yellow Squash"],
      all: ["Italian-Roasted Pork Loin", "Tarragon-Salmon Pasta", "Tofu Cacciatore", "Turkey and Pesto Sandwich", "Soynut Butter and Jelly on White Bread", "Build- Your-Own Chicken Sandwich", "French Onion Soup", "Cajun Chicken Salad", "Italian Pasta Salad", "Lemon-Mint Quinoa Tabbouleh", "Pesto Hummus", "Garlic-Roasted Potatoes", "Roasted Tomatoes", "Lemon-Garlic Sautéed Kale", "Steamed Yellow Squash", "Assorted Fresh-Cut Fruit", "Chocolate Chip Cookies (GF)"],
    },
    breakfast: {
      entree: "Grilled Ham",
      all: ["Grilled Ham", "Scrambled Eggs with Peppers and Onions", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Pain au Chocolate", "Pineapple Cup", "Red Grapes Cup", "Strawberry Cup", "Strawberry Shortcake Parfait", "Oreo® Chocolate Pudding Delight"],
      daily: ["Lions Mane Breakfast Platter", "Syrup", "Mayonnaise", "Mustard", "Grape Jelly", "Ketchup", "Hot Sauce", "Cream Cheese", "100% Apple Juice", "Shredded Hash Browns", "100% Orange Juice", "Assorted Tea", "Hot Cocoa", "Fresh-Brewed Decaf Coffee", "Fresh-Brewed Coffee", "Sticky Rice", "Salted Butter"],
    },
  },
};

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
    // Mon 09-14: LIVE Sage week of 09/14/2026 (fetched 2026-09-14, extractor
    // output verbatim). The month overview must show the Main Ingredient
    // station entrée ("Chicken Tenders"), not Entrées[0]
    // ("Honey-Glazed Ham"). ABC is null: the school feed URL is a placeholder
    // in local dev, so no ABC rotation is verifiable offline — a school day
    // with good Sage service and no ABC is an established pattern (see
    // mergeDay's 2026-09-03 case). No single-day Daily probe was run for
    // 09-14, so breakfast.daily is [].
    "2026-09-14": {
      date: "2026-09-14", dow: "Mon", abc: null, isSpecial: false, specialLabel: null,
      isNoSchool: false, noSchoolLabel: null,
      lunch: {
        entree: "Honey-Glazed Ham", special: "Chicken Finger Dipping Bar", feature: null,
        soups: ["Chicken and Rice Soup"],
        sides: ["Steamed Broccoli", "Roasted Sweet Potatoes", "Rice Pilaf", "Yellow Squash with Thyme and Basil"],
        all: ["Honey-Glazed Ham", "Chicken Tenders", "Red Bean and Kale Quinoa", "Chicken Salad Wrap", "Soynut Butter and Jelly on White Bread", "Chicken Finger Dipping Bar", "Chicken and Rice Soup", "Black Bean and Corn Salad", "Greek Tomato and Cucumber Salad", "Pesto Penne Salad", "Cheddar Cheese", "Hummus", "Steamed Broccoli", "Roasted Sweet Potatoes", "Rice Pilaf", "Yellow Squash with Thyme and Basil", "Cantaloupe", "Pineapple", "Cinnamon-Sugar Doughnut Holes"],
        details: [
          { name: "Honey-Glazed Ham", category: "Entrées", station: "Free Style™", price: "0", dot: "Red", allergens: [], maybeAllergens: [], lifestyle: [] },
          { name: "Chicken Tenders", category: "Entrées", station: "The Main Ingredient®", price: "0", dot: "Yellow", allergens: ["Wheat", "Gluten"], maybeAllergens: ["Oil"], lifestyle: [] },
          { name: "Red Bean and Kale Quinoa", category: "Entrées", station: "Vegitas®", price: "0", dot: "Green", allergens: [], maybeAllergens: [], lifestyle: ["Vegan"] },
          { name: "Chicken Salad Wrap", category: "Entrées", station: "The Classic Cuts Deli®", price: "0", dot: "Red", allergens: ["Wheat", "Gluten", "Egg"], maybeAllergens: ["Milk", "Soy", "Mustard", "Sulfites"], lifestyle: [] },
          { name: "Soynut Butter and Jelly on White Bread", category: "Entrées", station: "The Classic Cuts Deli®", price: "0", dot: "Yellow", allergens: ["Wheat", "Gluten", "Soy"], maybeAllergens: ["Egg", "Milk", "Sesame", "Sulfites"], lifestyle: ["Vegetarian"] },
          { name: "Chicken Finger Dipping Bar", category: "Specials", station: "Seasonings", price: "0", dot: "Green/Yellow/Red", allergens: ["Milk", "Soy", "Mustard"], maybeAllergens: ["Wheat", "Gluten", "Egg", "Fish", "Sesame", "Sulfites"], lifestyle: [] },
          { name: "Chicken and Rice Soup", category: "Soups", station: "Ladle & Co.", price: "0", dot: "Red", allergens: [], maybeAllergens: [], lifestyle: [] },
          { name: "Black Bean and Corn Salad", category: "Salads", station: "Improvisations®", price: "0", dot: "Yellow", allergens: [], maybeAllergens: [], lifestyle: ["Vegetarian"] },
          { name: "Greek Tomato and Cucumber Salad", category: "Salads", station: "Improvisations®", price: "0", dot: "Yellow", allergens: ["Milk"], maybeAllergens: ["Sulfites"], lifestyle: ["Vegetarian"] },
          { name: "Pesto Penne Salad", category: "Salads", station: "Improvisations®", price: "0", dot: "Green", allergens: ["Wheat", "Gluten", "Milk"], maybeAllergens: ["Egg"], lifestyle: ["Vegetarian"] },
          { name: "Cheddar Cheese", category: "Deli", station: "The Classic Cuts Deli®", price: "0", dot: "Red", allergens: ["Milk"], maybeAllergens: [], lifestyle: ["Vegetarian"] },
          { name: "Hummus", category: "Deli", station: "The Classic Cuts Deli®", price: "0", dot: "Green", allergens: ["Sesame"], maybeAllergens: [], lifestyle: ["Vegan"] },
          { name: "Steamed Broccoli", category: "Sides and Vegetables", station: "The Main Ingredient®, Free Style™", price: "0", dot: "Green", allergens: [], maybeAllergens: [], lifestyle: ["Vegan"] },
          { name: "Roasted Sweet Potatoes", category: "Sides and Vegetables", station: "Free Style™", price: "0", dot: "Green", allergens: [], maybeAllergens: [], lifestyle: ["Vegan"] },
          { name: "Rice Pilaf", category: "Sides and Vegetables", station: "The Main Ingredient®", price: "0", dot: "Yellow", allergens: ["Milk"], maybeAllergens: [], lifestyle: [] },
          { name: "Yellow Squash with Thyme and Basil", category: "Sides and Vegetables", station: "Vegitas®", price: "0", dot: "Yellow", allergens: [], maybeAllergens: [], lifestyle: ["Vegan"] },
          { name: "Cantaloupe", category: "Desserts", station: "Improvisations®", price: "0", dot: "Green", allergens: [], maybeAllergens: [], lifestyle: ["Vegan"] },
          { name: "Pineapple", category: "Desserts", station: "Improvisations®", price: "0", dot: "Green", allergens: [], maybeAllergens: [], lifestyle: ["Vegan"] },
          { name: "Cinnamon-Sugar Doughnut Holes", category: "Desserts", station: "P.S.", price: "0", dot: "Red", allergens: ["Wheat", "Gluten", "Egg", "Milk", "Soy"], maybeAllergens: [], lifestyle: ["Vegetarian"] },
        ],
      },
      breakfast: {
        entree: "Bacon",
        all: ["Bacon", "Turkey Bacon", "Western Scrambled Eggs", "Bagel & Cream Cheese", "Sticky Rice", "Cinnamon Rolls", "Croissants", "Pineapple Cup", "Red Grapes Cup", "Strawberry Cup", "S'mores Pudding Parfait", "Strawberry Shortcake Parfait"],
        daily: [],
      },
      sources: { icalUid: null, sageWeek: "09/14/2026" }, updatedAt: stamp,
    },
    // Tue 09-15 – Fri 09-18: LIVE Sage menus above; ABC unverifiable offline.
    "2026-09-15": schoolDay("2026-09-15", "Tue", LIVE_MENUS["2026-09-15"], null, "09/14/2026"),
    "2026-09-16": schoolDay("2026-09-16", "Wed", LIVE_MENUS["2026-09-16"], null, "09/14/2026"),
    "2026-09-17": schoolDay("2026-09-17", "Thu", LIVE_MENUS["2026-09-17"], null, "09/14/2026"),
    "2026-09-18": schoolDay("2026-09-18", "Fri", LIVE_MENUS["2026-09-18"], null, "09/14/2026"),
    // Mon 09-21 – Fri 09-25: PAWS week. Menus are the LIVE Sage week above;
    // schedule is the hand-supplied table (also mirrored in overrides/paws).
    "2026-09-21": schoolDay("2026-09-21", "Mon", LIVE_MENUS["2026-09-21"], PAWS_0921_0925["2026-09-21"], "09/21/2026"),
    "2026-09-22": schoolDay("2026-09-22", "Tue", LIVE_MENUS["2026-09-22"], PAWS_0921_0925["2026-09-22"], "09/21/2026"),
    "2026-09-23": schoolDay("2026-09-23", "Wed", LIVE_MENUS["2026-09-23"], PAWS_0921_0925["2026-09-23"], "09/21/2026"),
    "2026-09-24": schoolDay("2026-09-24", "Thu", LIVE_MENUS["2026-09-24"], PAWS_0921_0925["2026-09-24"], "09/21/2026"),
    "2026-09-25": schoolDay("2026-09-25", "Fri", LIVE_MENUS["2026-09-25"], PAWS_0921_0925["2026-09-25"], "09/21/2026"),
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
  // Mirror of the hand-maintained prod doc: cron reads `overrides/paws`
  // (one field per date) and bakes it into each day. Seeded so dev shows
  // where the PAWS content comes from end to end.
  {
    const fields: Record<string, unknown> = {};
    for (const [id, paws] of Object.entries(PAWS_0921_0925)) {
      fields[id] = { ...paws, week: PAWS_WEEK };
    }
    await db.collection("overrides").doc("paws").set(fields);
    console.log("seeded overrides/paws");
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
