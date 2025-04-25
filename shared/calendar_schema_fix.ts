import { pgTable, serial, date, integer, boolean, text, timestamp } from "drizzle-orm/pg-core";

// Neue Kalender-Übersicht Tabelle mit einer Spalte pro Bundesland
// Diese Tabelle zeigt für jeden Tag den Status in allen Bundesländern an
export const calendarOverviewFixed = pgTable("calendar_overview", {
  id: serial("id").primaryKey(),
  // Datum des Kalendertags
  date: date("date").notNull(),
  // Wochentag als Zahl (1-7, wobei 1=Montag)
  day_of_week: integer("day_of_week").notNull(),
  // Kalenderwoche des Jahres
  week_of_year: integer("week_of_year").notNull(),
  // Ist es ein Wochenendtag?
  is_weekend: boolean("is_weekend").notNull(),
  // Jahr
  year: integer("year").notNull(),
  // Monat (1-12)
  month: integer("month").notNull(),
  // Kalenderwoche
  week: integer("week"),
  
  // Status für jedes Bundesland
  // Baden-Württemberg
  bw_status: text("bw_status").default("WORKDAY"),
  bw_holiday_name: text("bw_holiday_name"),
  bw_is_school_holiday: boolean("bw_is_school_holiday").default(false),
  bw_is_public_holiday: boolean("bw_is_public_holiday").default(false),
  
  // Bayern
  by_status: text("by_status").default("WORKDAY"),
  by_holiday_name: text("by_holiday_name"),
  by_is_school_holiday: boolean("by_is_school_holiday").default(false),
  by_is_public_holiday: boolean("by_is_public_holiday").default(false),
  
  // Berlin
  be_status: text("be_status").default("WORKDAY"),
  be_holiday_name: text("be_holiday_name"),
  be_is_school_holiday: boolean("be_is_school_holiday").default(false),
  be_is_public_holiday: boolean("be_is_public_holiday").default(false),
  
  // Brandenburg
  bb_status: text("bb_status").default("WORKDAY"),
  bb_holiday_name: text("bb_holiday_name"),
  bb_is_school_holiday: boolean("bb_is_school_holiday").default(false),
  bb_is_public_holiday: boolean("bb_is_public_holiday").default(false),
  
  // Bremen
  hb_status: text("hb_status").default("WORKDAY"),
  hb_holiday_name: text("hb_holiday_name"),
  hb_is_school_holiday: boolean("hb_is_school_holiday").default(false),
  hb_is_public_holiday: boolean("hb_is_public_holiday").default(false),
  
  // Hamburg
  hh_status: text("hh_status").default("WORKDAY"),
  hh_holiday_name: text("hh_holiday_name"),
  hh_is_school_holiday: boolean("hh_is_school_holiday").default(false),
  hh_is_public_holiday: boolean("hh_is_public_holiday").default(false),
  
  // Hessen
  he_status: text("he_status").default("WORKDAY"),
  he_holiday_name: text("he_holiday_name"),
  he_is_school_holiday: boolean("he_is_school_holiday").default(false),
  he_is_public_holiday: boolean("he_is_public_holiday").default(false),
  
  // Mecklenburg-Vorpommern
  mv_status: text("mv_status").default("WORKDAY"),
  mv_holiday_name: text("mv_holiday_name"),
  mv_is_school_holiday: boolean("mv_is_school_holiday").default(false),
  mv_is_public_holiday: boolean("mv_is_public_holiday").default(false),
  
  // Niedersachsen
  ni_status: text("ni_status").default("WORKDAY"),
  ni_holiday_name: text("ni_holiday_name"),
  ni_is_school_holiday: boolean("ni_is_school_holiday").default(false),
  ni_is_public_holiday: boolean("ni_is_public_holiday").default(false),
  
  // Nordrhein-Westfalen
  nw_status: text("nw_status").default("WORKDAY"),
  nw_holiday_name: text("nw_holiday_name"),
  nw_is_school_holiday: boolean("nw_is_school_holiday").default(false),
  nw_is_public_holiday: boolean("nw_is_public_holiday").default(false),
  
  // Rheinland-Pfalz
  rp_status: text("rp_status").default("WORKDAY"),
  rp_holiday_name: text("rp_holiday_name"),
  rp_is_school_holiday: boolean("rp_is_school_holiday").default(false),
  rp_is_public_holiday: boolean("rp_is_public_holiday").default(false),
  
  // Saarland
  sl_status: text("sl_status").default("WORKDAY"),
  sl_holiday_name: text("sl_holiday_name"),
  sl_is_school_holiday: boolean("sl_is_school_holiday").default(false),
  sl_is_public_holiday: boolean("sl_is_public_holiday").default(false),
  
  // Sachsen
  sn_status: text("sn_status").default("WORKDAY"),
  sn_holiday_name: text("sn_holiday_name"),
  sn_is_school_holiday: boolean("sn_is_school_holiday").default(false),
  sn_is_public_holiday: boolean("sn_is_public_holiday").default(false),
  
  // Sachsen-Anhalt
  st_status: text("st_status").default("WORKDAY"),
  st_holiday_name: text("st_holiday_name"),
  st_is_school_holiday: boolean("st_is_school_holiday").default(false),
  st_is_public_holiday: boolean("st_is_public_holiday").default(false),
  
  // Schleswig-Holstein
  sh_status: text("sh_status").default("WORKDAY"),
  sh_holiday_name: text("sh_holiday_name"),
  sh_is_school_holiday: boolean("sh_is_school_holiday").default(false),
  sh_is_public_holiday: boolean("sh_is_public_holiday").default(false),
  
  // Thüringen
  th_status: text("th_status").default("WORKDAY"),
  th_holiday_name: text("th_holiday_name"),
  th_is_school_holiday: boolean("th_is_school_holiday").default(false),
  th_is_public_holiday: boolean("th_is_public_holiday").default(false),
  
  // Allgemeine Flags
  is_workday: boolean("is_workday").default(true),
  is_school_holiday: boolean("is_school_holiday").default(false),
  is_public_holiday: boolean("is_public_holiday").default(false),
  // Tagestyp (WORKDAY, WEEKEND, SCHOOL_HOLIDAY, PUBLIC_HOLIDAY)
  day_type: text("day_type").notNull(),
  
  // Zeitpunkt der Erstellung
  created_at: timestamp("created_at").defaultNow(),
  // Zeitpunkt der letzten Aktualisierung
  updated_at: timestamp("updated_at").defaultNow(),
});