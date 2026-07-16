import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Trash2, Download, List, LayoutGrid, ArrowUpDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as XLSX from "xlsx";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
  match?: (item: any, value: string) => boolean;
}

export interface ColumnConfig<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
}

interface CustomTableProps<T> {
  data: T[];
  columns: ColumnConfig<T>[];
  searchKey?: keyof T | ((item: T) => string);
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  onDeleteSelected?: (selectedIds: string[]) => Promise<void> | void;
  exportFileName?: string;
  getRowId: (item: T) => string;
  /** Optional: provide a display name for each item shown in the confirm dialog */
  getRowLabel?: (item: T) => string;
  renderItemCard?: (item: T, isSelected: boolean, onToggleSelect: () => void) => React.ReactNode;
}

export function CustomTable<T>({
  data,
  columns,
  searchKey,
  searchPlaceholder = "Search...",
  filters = [],
  onDeleteSelected,
  exportFileName = "table-export",
  getRowId,
  getRowLabel,
  renderItemCard,
}: CustomTableProps<T>) {
  // UI states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"table" | "list">("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Delete mode & confirm dialog state
  const [deleteMode, setDeleteMode] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Clear selections when data changes
  useMemo(() => {
    setSelectedIds(new Set());
    setDeleteMode(false);
  }, [data]);

  // 1. Client-side search and filter logic
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // Search matching
      if (searchQuery.trim() !== "" && searchKey) {
        const itemVal = typeof searchKey === "function" ? searchKey(item) : String(item[searchKey] || "");
        if (!itemVal.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
      }

      // Filter matching
      for (const filter of filters) {
        const selectedValue = filterValues[filter.key];
        if (selectedValue && selectedValue !== "all") {
          if (filter.match) {
            if (!filter.match(item, selectedValue)) {
              return false;
            }
          } else {
            // Check property value
            const propVal = String((item as any)[filter.key] || "");
            if (propVal.toLowerCase() !== selectedValue.toLowerCase()) {
              return false;
            }
          }
        }
      }

      return true;
    });
  }, [data, searchQuery, searchKey, filters, filterValues]);

  // 2. Client-side sort logic
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const sorted = [...filteredData].sort((a: any, b: any) => {
      const aVal = String(a[sortKey] || "");
      const bVal = String(b[sortKey] || "");
      return aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
    });
    return sortAsc ? sorted : sorted.reverse();
  }, [filteredData, sortKey, sortAsc]);

  // 3. Selection utilities
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const ids = new Set(sortedData.map((item) => getRowId(item)));
      setSelectedIds(ids);
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const isAllSelected = sortedData.length > 0 && selectedIds.size === sortedData.length;

  // 4. Excel Export (respecting active filters!)
  const handleExport = () => {
    // If search/filters are active, export filteredData. Otherwise export full data.
    const isFiltered = searchQuery.trim() !== "" || Object.values(filterValues).some(v => v && v !== "all");
    const dataToExport = isFiltered ? filteredData : data;

    if (dataToExport.length === 0) {
      alert("No data to export.");
      return;
    }

    // Flatten columns to simple headers
    const exportRows = dataToExport.map((item) => {
      const row: Record<string, any> = {};
      columns.forEach((col) => {
        let val = (item as any)[col.key];
        if (typeof val === "object" && val !== null) {
          val = JSON.stringify(val);
        }
        row[col.header] = val ?? "";
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, `${exportFileName}.xlsx`);
  };

  // 5. Delete mode toggle — clicking Delete activates selection mode
  const handleDeleteButtonClick = () => {
    if (!deleteMode) {
      // Enter delete mode — show checkboxes so user can pick rows
      setDeleteMode(true);
      setSelectedIds(new Set());
    } else if (selectedIds.size > 0) {
      // Already in delete mode and items are selected — show confirmation dialog
      setShowDeleteDialog(true);
    }
  };

  const handleCancelDelete = () => {
    setDeleteMode(false);
    setSelectedIds(new Set());
    setShowDeleteDialog(false);
  };

  // Confirm and execute deletion
  const handleConfirmDelete = async () => {
    if (selectedIds.size === 0 || !onDeleteSelected) return;
    setIsDeleting(true);
    try {
      await onDeleteSelected(Array.from(selectedIds));
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setDeleteMode(false);
      setSelectedIds(new Set());
    }
  };

  // Get display labels for the confirm dialog
  const selectedLabels = useMemo(() => {
    if (!getRowLabel) return [];
    return sortedData
      .filter((item) => selectedIds.has(getRowId(item)))
      .map((item) => getRowLabel(item));
  }, [selectedIds, sortedData, getRowLabel, getRowId]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="w-full space-y-4 animate-fade-in duration-300">
      {/* ────────────────── TABLE HEADER SECTION ────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-card border border-border p-4 rounded-2xl shadow-sm">
        {/* Left: Search bar */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-10 h-10 rounded-xl bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500"
          />
        </div>

        {/* Center: Dynamic Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <Select
              key={filter.key}
              value={filterValues[filter.key] || "all"}
              onValueChange={(val) => setFilterValues((prev) => ({ ...prev, [filter.key]: val }))}
            >
              <SelectTrigger className="h-10 w-[140px] rounded-xl bg-background border-input text-foreground">
                <SelectValue placeholder={`All ${filter.label}`} />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-popover-foreground">
                <SelectItem value="all">All {filter.label}</SelectItem>
                {filter.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>

        {/* Right: Actions & View Switcher */}
        <div className="flex items-center gap-2">
          {onDeleteSelected && (
            <>
              {deleteMode ? (
                /* Delete mode active — show "Delete (N)" and "Cancel" */
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleDeleteButtonClick}
                    disabled={selectedIds.size === 0}
                    variant="destructive"
                    className="h-10 rounded-xl px-4 flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>
                      {selectedIds.size > 0
                        ? `Delete (${selectedIds.size})`
                        : "Select rows to delete"}
                    </span>
                  </Button>
                  <Button
                    onClick={handleCancelDelete}
                    variant="outline"
                    className="h-10 rounded-xl px-4 flex items-center gap-2 border-input bg-background text-foreground hover:bg-muted transition-all"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                /* Default — single Delete button to enter delete mode */
                <Button
                  onClick={handleDeleteButtonClick}
                  variant="destructive"
                  className="h-10 rounded-xl px-4 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </Button>
              )}
            </>
          )}

          <Button
            onClick={handleExport}
            variant="outline"
            className="h-10 rounded-xl px-4 flex items-center gap-2 border-input bg-background text-foreground hover:bg-muted transition-all"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>

          {/* View Toggler (Table vs List) */}
          <div className="flex items-center bg-muted border border-border p-1 rounded-xl h-10">
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "table" ? "bg-background text-emerald-600 shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Table view"
            >
              <LayoutGrid className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "list" ? "bg-background text-emerald-600 shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              title="List view"
            >
              <List className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────── CONTENT VIEW SECTION ────────────────── */}
      {viewMode === "table" ? (
        /* TABLE VIEW: Adapts dynamically to light/dark themes */
        <ScrollArea className="rounded-2xl border border-border overflow-hidden shadow-sm bg-card">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-full divide-y divide-border">
              <TableHeader className="bg-muted/50">
                <TableRow className="border-b border-border hover:bg-transparent">
                  {/* Checkbox column — only visible in delete mode */}
                  {deleteMode && (
                    <TableHead className="w-12 px-4 py-3.5 text-center">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        className="border-border bg-background data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                      />
                    </TableHead>
                  )}
                  {columns.map((col) => (
                    <TableHead key={col.key} className="px-4 py-3.5 text-left font-semibold text-muted-foreground">
                      {col.sortable ? (
                        <button
                          onClick={() => toggleSort(col.key)}
                          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                        >
                          <span>{col.header}</span>
                          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                        </button>
                      ) : (
                        <span>{col.header}</span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {sortedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + (deleteMode ? 1 : 0)} className="h-32 text-center text-muted-foreground">
                      No matching records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedData.map((item, index) => {
                    const rowId = getRowId(item);
                    const isSelected = selectedIds.has(rowId);
                    return (
                      <TableRow
                        key={rowId}
                        className={`border-b border-border transition-colors duration-250 ${
                          isSelected ? "bg-red-950/20 border-l-2 border-l-red-500" : "hover:bg-muted/30"
                        }`}
                      >
                        {/* Selection circle — only visible in delete mode */}
                        {deleteMode && (
                          <TableCell className="px-4 py-3 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectRow(rowId, !!checked)}
                              className="border-border bg-background data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500 rounded-full"
                            />
                          </TableCell>
                        )}
                        {columns.map((col) => (
                          <TableCell key={col.key} className="px-4 py-3 text-foreground text-sm">
                            {col.render ? col.render(item, index) : String((item as any)[col.key] ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      ) : (
        /* LIST VIEW: Responsive cards grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedData.length === 0 ? (
            <div className="col-span-full py-16 text-center text-muted-foreground border border-dashed border-border rounded-2xl bg-card">
              No matching records found.
            </div>
          ) : (
            sortedData.map((item, index) => {
              const rowId = getRowId(item);
              const isSelected = selectedIds.has(rowId);
              const onToggleSelect = () => {
                if (deleteMode) handleSelectRow(rowId, !isSelected);
              };

              if (renderItemCard) {
                return renderItemCard(item, isSelected, onToggleSelect);
              }

              // Fallback default list card
              return (
                <div
                  key={rowId}
                  onClick={deleteMode ? onToggleSelect : undefined}
                  className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between h-full bg-card ${
                    deleteMode ? "cursor-pointer" : ""
                  } ${
                    isSelected
                      ? "border-red-500 shadow-md shadow-red-500/5 bg-red-950/10"
                      : "border-border hover:border-muted-foreground/35 hover:bg-muted/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      {columns.map((col, idx) => {
                        const cellVal = col.render ? col.render(item, index) : String((item as any)[col.key] ?? "");
                        if (idx === 0) {
                          return (
                            <h3 key={col.key} className="font-bold text-foreground text-base leading-snug">
                              {cellVal}
                            </h3>
                          );
                        }
                        return (
                          <div key={col.key} className="text-xs text-muted-foreground flex items-start gap-1">
                            <span className="font-medium text-muted-foreground/80 min-w-[70px]">{col.header}:</span>
                            <span>{cellVal}</span>
                          </div>
                        );
                      })}
                    </div>
                    {deleteMode && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleSelectRow(rowId, !!checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="border-border bg-background data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500 rounded-full mt-1"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ────────────────── DELETE CONFIRMATION DIALOG ────────────────── */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => !open && setShowDeleteDialog(false)}>
        <DialogContent className="max-w-md bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400 text-lg font-bold">
              <Trash2 className="h-5 w-5" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <p className="text-slate-300 text-sm">
              You are about to permanently delete{" "}
              <span className="font-semibold text-red-400">{selectedIds.size}</span>{" "}
              {selectedIds.size === 1 ? "item" : "items"}. This action cannot be undone.
            </p>

            {selectedLabels.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-1.5 max-h-40 overflow-y-auto">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">
                  Items to be deleted:
                </p>
                {selectedLabels.map((label, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-sm text-slate-200"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 pt-2">
            <Button
              onClick={() => setShowDeleteDialog(false)}
              variant="outline"
              className="flex-1 h-10 rounded-xl border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-all"
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-900/30 transition-all flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
