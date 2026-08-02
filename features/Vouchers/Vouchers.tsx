"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useReactToPrint } from "react-to-print";
import VoucherPrintTemplate from "./VoucherPrintTemp";
import VoucherStats from "./VoucherStats";

// Define the type for the voucher data returned from the API
interface IVoucherResponse {
    _id: string;
    copyNumber: string;
    uniqueNumber: string;
    amount: number | { $numberInt: string };
    description: string;
    createdAt: string;
    updatedAt?: string;
    postedAt?: string;
    postedBy?: string;
    expenseEntry?: { _id: string } | string;
}

interface IErrorResponse {
    error?: string;
}

export interface IVoucher {
    _id: string;
    copyNumber: string;
    uniqueNumber: string;
    amount: number;
    description: string;
    createdAt: string;
    updatedAt?: string;
    postedAt?: string;
    postedBy?: string;
    expenseEntry?: string;
}

// Define a type for the summary row
interface ISummaryRow {
    type: "summary";
    date: string;
    key: string; // Unique key for rendering
}

// Type for rendering, which can be a voucher or a summary row
type VoucherOrSummary = IVoucher | ISummaryRow;

interface IConfig {
    currentCopyNumber: string;
    uniqueNumberPrefix: string;
    limit: number;
}

const formatDate = (isoString: string | undefined): string => {
    if (!isoString) return "No Date";
    try {
        // Only return the date part for comparison (YYYY-MM-DD)
        return new Date(isoString).toISOString().split('T')[0];
    } catch {
        return "Invalid Date";
    }
};

export default function Vouchers() {
    const [vouchers, setVouchers] = useState<IVoucher[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Config states
    const [config, setConfig] = useState<IConfig>({ currentCopyNumber: "", uniqueNumberPrefix: "", limit: 0 });
    const [newCopyNumber, setNewCopyNumber] = useState("");
    const [newUniquePrefix, setNewUniquePrefix] = useState("");
    const [newLimit, setNewLimit] = useState("");
    const [currentUsedCount, setCurrentUsedCount] = useState(0);

    // Editing states
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState("");
    const [editDescription, setEditDescription] = useState("");

    // Printing
    const [selectedVoucher, setSelectedVoucher] = useState<IVoucher | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    // Pagination states
    const VOUCHERS_PER_PAGE = 30; // Define how many items per page
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalVouchersCount, setTotalVouchersCount] = useState(0); // Total count from server (unfiltered)

    // Search/Filter states
    const [searchTerm, setSearchTerm] = useState(""); // UI input state
    const [filterTerm, setFilterTerm] = useState(""); // State used for API call (to prevent excessive fetching)
    const [filteredVouchers, setFilteredVouchers] = useState<IVoucher[]>([]); // This is now the data returned for the current page
    
    // New state/memo for displaying data with summary rows
    const [vouchersWithSummaries, setVouchersWithSummaries] = useState<VoucherOrSummary[]>([]);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        onAfterPrint: () => setSelectedVoucher(null),
    });

    const triggerPrint = (voucher: IVoucher) => {
        setSelectedVoucher(voucher);
        setTimeout(() => handlePrint(), 100);
    };

    // --- Core Logic for Summary Row Generation ---
    useEffect(() => {
        if (filteredVouchers.length === 0) {
            setVouchersWithSummaries([]);
            return;
        }

        const result: VoucherOrSummary[] = [];
        
        // Assuming filteredVouchers is sorted in descending order of postedAt (newest first)
        let lastDate: string | null = null;

        for (const v of filteredVouchers) {
            const currentDate = formatDate(v.postedAt);

            if (v.postedAt && currentDate !== "Invalid Date") {
                if (lastDate === null) {
                    // First voucher, add a summary line for its date
                    result.push({ 
                        type: "summary", 
                        date: new Date(currentDate).toLocaleDateString(undefined, {
                            year: 'numeric', month: 'long', day: 'numeric'
                        }), 
                        key: `summary-${currentDate}` 
                    });
                    
                } else if (currentDate !== lastDate) {
                    // Date changed, insert a summary line for the *current* voucher's date
                    result.push({ 
                        type: "summary", 
                        date: new Date(currentDate).toLocaleDateString(undefined, {
                            year: 'numeric', month: 'long', day: 'numeric'
                        }), 
                        key: `summary-${currentDate}` 
                    });
                }
                lastDate = currentDate; // Update the last known date
            } else {
                 // For unposted vouchers, reset the date tracking and don't show a summary line for it.
                 lastDate = null;
            }
            
            result.push(v); // Add the actual voucher
        }

        setVouchersWithSummaries(result);
    }, [filteredVouchers]);
    // ---------------------------------------------


    // Fetch voucher config
    const fetchVoucherConfig = async () => {
        try {
            const res = await fetch("/api/vouchers/config");
            if (!res.ok) throw new Error("Failed to fetch config");
            const data = await res.json();
            setConfig({
                currentCopyNumber: data.currentCopyNumber,
                uniqueNumberPrefix: data.uniqueNumberPrefix,
                limit: data.limit,
            });
        } catch (err) {
            console.error(err);
        }
    };

    const fetchVouchers = async (page = currentPage, limit = VOUCHERS_PER_PAGE, search = filterTerm) => {
        setLoading(true);
        setError("");

        // Construct the URL with pagination and search parameters
        const query = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString(),
            search: search,
        }).toString();
        
        try {
            const res = await fetch(`/api/vouchers?${query}`);
            const responseData = await res.json(); // Data now contains pagination info
            
            if (!res.ok) {
                setError(responseData.error || "Failed to load vouchers.");
                setVouchers([]); 
                setFilteredVouchers([]);
                setTotalPages(1);
                setTotalVouchersCount(0);
            } else {
                // ASSUMPTION: API returns { vouchers: IVoucherResponse[], totalCount: number, totalPages: number }
                const { vouchers: apiVouchers, totalCount, totalPages } = responseData;

                const parsed: IVoucher[] = apiVouchers.map((v: IVoucherResponse) => ({
                    _id: v._id,
                    copyNumber: v.copyNumber,
                    uniqueNumber: v.uniqueNumber,
                    amount:
                        typeof v.amount === "object" && "$numberInt" in v.amount
                            ? parseFloat(v.amount.$numberInt)
                            : v.amount,
                    description: v.description,
                    createdAt: v.createdAt,
                    updatedAt: v.updatedAt,
                    postedAt: v.postedAt,
                    postedBy: v.postedBy,
                    expenseEntry:
                        typeof v.expenseEntry === "object"
                            ? v.expenseEntry._id
                            : v.expenseEntry,
                }));
                
                // Update states with data from the server
                setVouchers(parsed); // 'vouchers' is the current page data
                setFilteredVouchers(parsed); // FilteredVouchers is now the same as vouchers (since filtering is server-side)
                setTotalPages(totalPages);
                setTotalVouchersCount(totalCount);
                setCurrentPage(page); // Ensure current page state is updated
            }
        } catch {
            setError("Failed to fetch vouchers.");
        }
        setLoading(false);
    };

    // Handler to trigger the search API call when Enter is pressed
    const handleSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            if (searchTerm !== filterTerm) {
                setFilterTerm(searchTerm);
                fetchVouchers(1, VOUCHERS_PER_PAGE, searchTerm); 
            }
        }
    };


    // Compute used count when vouchers or config change
    useEffect(() => {
        if (config.currentCopyNumber) {
            const used = vouchers.filter(v => v.copyNumber === config.currentCopyNumber).length;
            setCurrentUsedCount(used);
        }
    }, [vouchers, config]);

    // Initial load
    useEffect(() => {
        fetchVoucherConfig();
        fetchVouchers(1); // Start on page 1
    }, []);

    // Delete voucher
    const deleteVoucher = async (id: string) => {
        await fetch(`/api/vouchers/${id}`, { method: "DELETE" });
        fetchVouchers(currentPage, VOUCHERS_PER_PAGE, filterTerm);
    };

    // Update voucher config
    const updateVoucherConfig = async () => {
        if (!newCopyNumber || !newUniquePrefix || !newLimit) {
            setError("All config fields are required.");
            return;
        }
        const parsedLimit = parseInt(newLimit);
        if (isNaN(parsedLimit) || parsedLimit < 1) {
            setError("Limit must be a positive number.");
            return;
        }

        const res = await fetch("/api/vouchers/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                currentCopyNumber: newCopyNumber,
                uniqueNumberPrefix: newUniquePrefix,
                start: 1,
                limit: parsedLimit,
            }),
        });

        if (!res.ok) {
            const data = await res.json();
            setError(data?.error || "Failed to update config.");
        } else {
            setNewCopyNumber("");
            setNewUniquePrefix("");
            setNewLimit("");
            setError("");
            fetchVoucherConfig();
            fetchVouchers(1); // Refetch list after config update
        }
    };

    // Edit voucher
    const startEditing = (v: IVoucher) => {
        setEditingId(v._id);
        setEditAmount(v.amount.toString());
        setEditDescription(v.description);
    };
    const cancelEditing = () => { setEditingId(null); setEditAmount(""); setEditDescription(""); };
    const saveEdit = async (id: string) => {
        const res = await fetch(`/api/vouchers/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: parseFloat(editAmount), description: editDescription }),
        });
        if (res.ok) { 
            cancelEditing(); 
            fetchVouchers(currentPage, VOUCHERS_PER_PAGE, filterTerm); 
        }
        else { const data = await res.json(); setError(data?.error || "Failed to update voucher."); }
    };

    return (
        <div className="space-y-6">
            <VoucherStats /> 
            <div className="p-4 bg-white shadow rounded-lg border border-gray-200">
                <input
                    type="text"
                    placeholder="Search by description, unique # (Press Enter to search all vouchers)..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={handleSearchSubmit} 
                    className="border px-4 py-2 rounded-lg w-full focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-500 mt-2">
                    Showing {filteredVouchers.length} vouchers on page {currentPage}. Total vouchers: {totalVouchersCount}.
                </p>
            </div>

            {error && <div className="bg-red-100 text-red-700 p-3 rounded text-sm">{error}</div>}

            {/* Config Section */}
            <div className="border p-4 rounded-md bg-yellow-50 space-y-4">
                <div className="text-sm text-gray-700">
                    {config.currentCopyNumber ? (
                        <>
                            Current Copy Number: <strong>{config.currentCopyNumber}</strong><br />
                            Used Unique Numbers: <strong>{currentUsedCount} / {config.limit}</strong><br />
                            Remaining: <strong>{config.limit - currentUsedCount}</strong>
                        </>
                    ) : (
                        <span>No voucher config set.</span>
                    )}
                </div>

                <h3 className="text-yellow-700 font-semibold text-sm">Voucher Book Configuration</h3>
                <div className="flex flex-col md:flex-row gap-3">
                    <input type="text" placeholder="New Copy Number (e.g. B01)" value={newCopyNumber} onChange={e => setNewCopyNumber(e.target.value)} className="border px-3 py-2 rounded w-full md:w-40" />
                    <input type="text" placeholder="New Unique Prefix (e.g. B4)" value={newUniquePrefix} onChange={e => setNewUniquePrefix(e.target.value)} className="border px-3 py-2 rounded w-full md:w-40" />
                    <input type="number" placeholder="Limit (e.g. 25)" value={newLimit} onChange={e => setNewLimit(e.target.value)} className="border px-3 py-2 rounded w-full md:w-32" />
                    <button onClick={updateVoucherConfig} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition">Save Config</button>
                </div>
            </div>

            {/* Vouchers Table */}
            {loading ? (
                <p className="text-center p-4">Loading...</p>
            ) : (
                <div className="overflow-x-auto bg-white shadow rounded-lg">
                    <table className="w-full table-auto text-sm">
                        <thead className="bg-gray-200 text-gray-700 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left">Copy #</th>
                                <th className="px-4 py-2 text-left">Unique #</th>
                                <th className="px-4 py-2 text-left">Amount</th>
                                <th className="px-4 py-2 text-left">Description</th>
                                <th className="px-4 py-2 text-left">Posted</th>
                                <th className="px-4 py-2 text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Render vouchers and summary rows */}
                            {vouchersWithSummaries.map(item => {
                                if ((item as ISummaryRow).type === "summary") {
                                    const summary = item as ISummaryRow;
                                    return (
                                        <tr key={summary.key} className="bg-gray-200 border-b">
                                            <td colSpan={6} className="px-4 py-2 text-left font-semibold text-black">
                                                Vouchers Posted On: {summary.date}
                                            </td>
                                        </tr>
                                    );
                                }
                                
                                const v = item as IVoucher;
                                return (
                                    <tr key={v._id} className="border-b hover:bg-gray-50">
                                        <td className="px-4 py-2">{v.copyNumber}</td>
                                        <td className="px-4 py-2">{v.uniqueNumber}</td>
                                        <td className="px-4 py-2">
                                            {editingId === v._id ? (
                                                <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="border rounded px-2 py-1 w-20" />
                                            ) : v?.amount?.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-2">
                                            {editingId === v._id ? (
                                                <input type="text" value={editDescription} onChange={e => setEditDescription(e.target.value)} className="border rounded px-2 py-1 w-full" />
                                            ) : v.description}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-600">
                                            {v.postedAt ? (
                                                <div className="text-green-600">{new Date(v.postedAt).toLocaleDateString()}<br /><span className="text-xs italic">by {v.postedBy}</span></div>
                                            ) : <span className="text-gray-400">–</span>}
                                        </td>
                                        <td className="px-4 py-2 flex gap-2">
                                            {editingId === v._id ? (
                                                <>
                                                    <button onClick={() => saveEdit(v._id)} className="text-green-600 hover:underline">Save</button>
                                                    <button onClick={cancelEditing} className="text-gray-500 hover:underline">Cancel</button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => startEditing(v)} className="text-blue-600 hover:underline">Edit</button>
                                                    <button onClick={() => deleteVoucher(v._id)} className="text-red-500 hover:underline">Delete</button>
                                                    <button onClick={() => triggerPrint(v)} className="bg-blue-500 text-white px-3 py-1 rounded">Print</button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredVouchers.length === 0 && <tr><td colSpan={6} className="text-center py-4">No vouchers found on this page.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
            
            {/* Pagination Controls (NEW) */}
            <div className="flex justify-between items-center p-4 bg-white shadow rounded-lg border border-gray-200">
                <button
                    onClick={() => fetchVouchers(currentPage - 1)}
                    disabled={currentPage <= 1 || loading}
                    className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50 transition"
                >
                    Previous
                </button>
                <span className="text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                </span>
                <button
                    onClick={() => fetchVouchers(currentPage + 1)}
                    disabled={currentPage >= totalPages || loading}
                    className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50 transition"
                >
                    Next
                </button>
            </div>

            {selectedVoucher && (
                <div style={{ display: "none" }}>
                    <VoucherPrintTemplate ref={printRef} slip={selectedVoucher} />
                </div>
            )}
        </div>
    );
}