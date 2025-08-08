import { db } from '../db';
import { holidays } from '../../shared/schema';
import { and, gte, lte, eq, sql } from 'drizzle-orm';

export interface Holiday {
  id: number;
  name: string;
  date: Date;
  type: 'PUBLIC_HOLIDAY' | 'SCHOOL_HOLIDAY';
  state: string;
  description?: string;
}

export const holidayService = {
  /**
   * Get holidays by date range
   */
  async getHolidaysByDateRange(startDate: string, endDate: string): Promise<Holiday[]> {
    try {
      const result = await db
        .select({
          id: holidays.id,
          name: holidays.name,
          date: holidays.date,
          type: holidays.type,
          state: holidays.state,
          description: holidays.description
        })
        .from(holidays)
        .where(
          and(
            gte(holidays.date, new Date(startDate)),
            lte(holidays.date, new Date(endDate))
          )
        )
        .orderBy(holidays.date, holidays.state);

      return result.map(h => ({
        ...h,
        date: new Date(h.date)
      }));
    } catch (error) {
      console.error('Error fetching holidays by date range:', error);
      return [];
    }
  },

  /**
   * Get holidays for a specific date
   */
  async getHolidaysForDate(date: string): Promise<Holiday[]> {
    try {
      const result = await db
        .select()
        .from(holidays)
        .where(eq(holidays.date, new Date(date)))
        .orderBy(holidays.state);

      return result.map(h => ({
        ...h,
        date: new Date(h.date)
      }));
    } catch (error) {
      console.error('Error fetching holidays for date:', error);
      return [];
    }
  },

  /**
   * Check if a date is a holiday for a specific state
   */
  async isHoliday(date: string, state?: string): Promise<Holiday | null> {
    try {
      const conditions = [eq(holidays.date, new Date(date))];
      if (state) {
        conditions.push(eq(holidays.state, state));
      }

      const result = await db
        .select()
        .from(holidays)
        .where(and(...conditions))
        .limit(1);

      if (result.length > 0) {
        return {
          ...result[0],
          date: new Date(result[0].date)
        };
      }
      return null;
    } catch (error) {
      console.error('Error checking if date is holiday:', error);
      return null;
    }
  },

  /**
   * Get upcoming holidays
   */
  async getUpcomingHolidays(days: number = 30, type?: 'PUBLIC_HOLIDAY' | 'SCHOOL_HOLIDAY'): Promise<Holiday[]> {
    try {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      const conditions = [
        gte(holidays.date, today),
        lte(holidays.date, futureDate)
      ];

      if (type) {
        conditions.push(eq(holidays.type, type));
      }

      const result = await db
        .select()
        .from(holidays)
        .where(and(...conditions))
        .orderBy(holidays.date, holidays.state)
        .limit(100);

      return result.map(h => ({
        ...h,
        date: new Date(h.date)
      }));
    } catch (error) {
      console.error('Error fetching upcoming holidays:', error);
      return [];
    }
  },

  /**
   * Get holiday statistics for a year
   */
  async getHolidayStats(year: number): Promise<{
    totalPublicHolidays: number;
    totalSchoolHolidays: number;
    stateStats: Array<{
      state: string;
      publicHolidays: number;
      schoolHolidays: number;
    }>;
  }> {
    try {
      // Get overall stats
      const overallStats = await db
        .select({
          totalPublicHolidays: sql<number>`COUNT(CASE WHEN type = 'PUBLIC_HOLIDAY' THEN 1 END)`,
          totalSchoolHolidays: sql<number>`COUNT(CASE WHEN type = 'SCHOOL_HOLIDAY' THEN 1 END)`
        })
        .from(holidays)
        .where(sql`EXTRACT(YEAR FROM date) = ${year}`);

      // Get state-wise stats
      const stateStats = await db
        .select({
          state: holidays.state,
          publicHolidays: sql<number>`COUNT(CASE WHEN type = 'PUBLIC_HOLIDAY' THEN 1 END)`,
          schoolHolidays: sql<number>`COUNT(CASE WHEN type = 'SCHOOL_HOLIDAY' THEN 1 END)`
        })
        .from(holidays)
        .where(sql`EXTRACT(YEAR FROM date) = ${year}`)
        .groupBy(holidays.state)
        .orderBy(holidays.state);

      return {
        totalPublicHolidays: overallStats[0]?.totalPublicHolidays || 0,
        totalSchoolHolidays: overallStats[0]?.totalSchoolHolidays || 0,
        stateStats: stateStats || []
      };
    } catch (error) {
      console.error('Error fetching holiday statistics:', error);
      return {
        totalPublicHolidays: 0,
        totalSchoolHolidays: 0,
        stateStats: []
      };
    }
  }
};

/**
 * Synchronizes missing holidays for specified years and states
 * This function integrates with the comprehensive holiday sync service
 * to ensure all German federal states have up-to-date holiday data
 * 
 * @param startYear Starting year for synchronization
 * @param endYear Ending year for synchronization  
 * @param states Optional array of state codes (defaults to all German states)
 * @param includeSchoolHolidays Whether to include school holidays
 * @returns Synchronization result with statistics
 */
export async function syncMissingHolidays(
  startYear: number = new Date().getFullYear(),
  endYear: number = new Date().getFullYear() + 1,
  states?: string[],
  includeSchoolHolidays: boolean = true
): Promise<{
  success: boolean;
  totalHolidays: number;
  totalCalendarDays: number;
  yearsProcessed: number;
  errors: string[];
  message: string;
}> {
  console.log(`🗓️ Starting comprehensive holiday synchronization for years ${startYear}-${endYear}`);
  
  try {
    // Import the comprehensive holiday sync functions
    const { syncMultipleYears, syncComprehensiveHolidays } = await import('./comprehensiveHolidaySync');
    
    let result;
    const errors: string[] = [];
    
    if (startYear === endYear) {
      // Single year synchronization
      console.log(`Syncing holidays for single year: ${startYear}`);
      const singleYearResult = await syncComprehensiveHolidays(startYear);
      
      result = {
        success: singleYearResult.success,
        totalHolidays: singleYearResult.addedHolidays,
        totalCalendarDays: singleYearResult.addedCalendarDays,
        yearsProcessed: 1,
        errors: singleYearResult.errors || []
      };
    } else {
      // Multiple years synchronization
      console.log(`Syncing holidays for multiple years: ${startYear}-${endYear}`);
      const multiYearResult = await syncMultipleYears(startYear, endYear);
      
      result = {
        success: multiYearResult.success,
        totalHolidays: multiYearResult.totalHolidays,
        totalCalendarDays: multiYearResult.totalCalendarDays,
        yearsProcessed: endYear - startYear + 1,
        errors: []
      };
      
      // Collect errors from individual year results
      Object.values(multiYearResult.results).forEach((yearResult: any) => {
        if (yearResult.errors && yearResult.errors.length > 0) {
          result.errors.push(...yearResult.errors);
        }
      });
    }
    
    // Generate summary message
    const message = result.success 
      ? `✅ Holiday synchronization completed: ${result.totalHolidays} holidays and ${result.totalCalendarDays} calendar entries added across ${result.yearsProcessed} year(s)`
      : `⚠️ Holiday synchronization completed with errors: ${result.totalHolidays} holidays added, ${result.errors.length} errors occurred`;
    
    console.log(message);
    
    return {
      ...result,
      message
    };
    
  } catch (error) {
    const errorMessage = `❌ Holiday synchronization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(errorMessage, error);
    
    return {
      success: false,
      totalHolidays: 0,
      totalCalendarDays: 0,
      yearsProcessed: 0,
      errors: [errorMessage],
      message: errorMessage
    };
  }
}