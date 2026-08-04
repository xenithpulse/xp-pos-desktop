/**
 * Table Normalization Injection API
 * 
 * Normalizes old table documents to the new compressed format:
 * - Converts `ia` from boolean to number (true → 1, false → 0)
 * - Adds sectionId (`si`) reference to Ground Floor section
 * - Adds missing fields (gi, so, cAt, uAt, lsc)
 * - Resets status to available (s: 0) and clears active sessions
 * - Uses batch processing for efficiency
 * 
 * GET /api/injections/normalize-tables - Run the injection
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardInjections } from '@/lib/injectionsGuard';
import { mongooseConnect } from '@/lib/mongoose';
import { Types } from 'mongoose';

const BATCH_SIZE = 100;

// Status codes: 0=available, 1=reserved, 2=occupied, 3=cleaning, 4=blocked
const AVAILABLE_STATUS = 0;

interface NormalizationStats {
  total: number;
  normalized: number;
  skipped: number;
  sectionCreated: boolean;
  sectionId: string | null;
  batches: number;
  errors: string[];
}

/**
 * Check if a table needs normalization
 */
function needsNormalization(table: Record<string, unknown>): boolean {
  return (
    typeof table.ia === 'boolean' ||           // Old boolean format
    !('si' in table) ||                        // Missing sectionId
    !('gi' in table) ||                        // Missing groupId
    !('so' in table) ||                        // Missing sortOrder
    !('cAt' in table) ||                       // Missing createdAt
    !('lsc' in table)                          // Missing lastStatusChangeAt
  );
}

export async function GET(req: NextRequest) {
  // Setup endpoints are destructive and unauthenticated by design, so they must
  // be unreachable in normal operation. This guard was written for that and then
  // not wired up here - see lib/injectionsGuard.ts.
  const denied = guardInjections(req);
  if (denied) return denied;

  const startTime = Date.now();

  try {
    const conn = await mongooseConnect();
    const tablesCollection = conn.collection('tables');
    const sectionsCollection = conn.collection('tablesections');

    const stats: NormalizationStats = {
      total: 0,
      normalized: 0,
      skipped: 0,
      sectionCreated: false,
      sectionId: null,
      batches: 0,
      errors: [],
    };

    // Step 1: Find or create the "Ground Floor" section
    console.log('[Table Injection] Step 1: Finding/creating Ground Floor section...');
    
    let section = await sectionsCollection.findOne({ n: 'Ground Floor' });
    
    if (!section) {
      // Create the Ground Floor section
      const result = await sectionsCollection.insertOne({
        _id: new Types.ObjectId('69b9e182e39fb5c0e6ca1127'),  // Use the same ID from T1
        n: 'Ground Floor',
        cl: '#6366f1',      // Default indigo color
        fl: 0,              // Floor level 0
        ia: 1,              // Active
      });
      stats.sectionCreated = true;
      stats.sectionId = result.insertedId.toString();
      console.log(`[Table Injection] Created Ground Floor section: ${stats.sectionId}`);
    } else {
      stats.sectionId = section._id.toString();
      console.log(`[Table Injection] Found existing Ground Floor section: ${stats.sectionId}`);
    }

    const sectionObjectId = new Types.ObjectId(stats.sectionId);

    // Step 2: Count and process tables in batches
    stats.total = await tablesCollection.countDocuments({});
    console.log(`[Table Injection] Found ${stats.total} tables to process`);

    const totalBatches = Math.ceil(stats.total / BATCH_SIZE);
    console.log(`[Table Injection] Processing in ${totalBatches} batches of ${BATCH_SIZE}`);

    // Get all table IDs for batch processing
    const tables = await tablesCollection.find({}).toArray();
    const now = new Date();

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, tables.length);
      const batchTables = tables.slice(start, end);

      try {
        const bulkOps = [];

        for (const table of batchTables) {
          if (!needsNormalization(table as Record<string, unknown>)) {
            stats.skipped++;
            continue;
          }

          // Prepare normalized update
          const update: Record<string, unknown> = {
            // Convert ia from boolean to number
            ia: table.ia === true || table.ia === 1 ? 1 : 0,
            
            // Add sectionId and sectionName
            si: sectionObjectId,
            sn: 'Ground Floor',
            
            // Reset status to available and clear session
            s: AVAILABLE_STATUS,
            
            // Add missing fields with defaults
            gi: table.gi ?? null,
            so: table.so ?? 0,
            
            // Add timestamps
            cAt: table.cAt ?? now,
            uAt: now,
            lsc: table.lsc ?? now,
          };

          // Fields to unset (if any old fields need removal)
          const unsetFields: Record<string, string> = {};
          
          // Remove activeSessionId since we're resetting
          if (table.as) {
            unsetFields.as = '';
          }

          bulkOps.push({
            updateOne: {
              filter: { _id: table._id },
              update: {
                $set: update,
                ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}),
              },
            },
          });

          stats.normalized++;
        }

        if (bulkOps.length > 0) {
          const result = await tablesCollection.bulkWrite(bulkOps, { ordered: false });
          console.log(`[Table Injection] Batch ${batch + 1}/${totalBatches}: Updated ${result.modifiedCount} tables`);
        }
        
        stats.batches++;

      } catch (error) {
        const errorMsg = `Batch ${batch + 1}: ${(error as Error).message}`;
        stats.errors.push(errorMsg);
        console.error(`[Table Injection] Error:`, errorMsg);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[Table Injection] Complete!`);
    console.log(`  - Total tables: ${stats.total}`);
    console.log(`  - Normalized: ${stats.normalized}`);
    console.log(`  - Skipped (already normalized): ${stats.skipped}`);
    console.log(`  - Section ID: ${stats.sectionId}`);
    console.log(`  - Section created: ${stats.sectionCreated}`);
    console.log(`  - Batches processed: ${stats.batches}`);
    console.log(`  - Errors: ${stats.errors.length}`);
    console.log(`  - Duration: ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: 'Table normalization complete',
      stats,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error('[Table Injection] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
