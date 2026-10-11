import { useState, useMemo, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Trash2, Download, List, LayoutGrid, ArrowUpDown, X, ChevronDown, CheckSquare, Loader2, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from "xlsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  renderItemCard,
}: CustomTableProps<T>) {
  // UI states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"table" | "list">("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  // Delete mode: checkboxes only visible when true
  const [deleteMode, setDeleteMode] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Clear selections when data changes
  useEffect(() => {
    setSelectedIds(new Set());
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
    if (checked && !deleteMode) {
      setDeleteMode(true);
    }
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

  const enterDeleteMode = () => {
    setDeleteMode(true);
    setSelectedIds(new Set());
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedIds(new Set());
    setConfirmDialogOpen(false);
  };

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

  // 4b. PDF Export (respecting active filters!)
  const handleExportPDF = async () => {
    const isFiltered = searchQuery.trim() !== "" || Object.values(filterValues).some(v => v && v !== "all");
    const dataToExport = isFiltered ? filteredData : data;

    if (dataToExport.length === 0) {
      alert("No data to export.");
      return;
    }

    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
    const vfsFonts: any = await import('pdfmake/build/vfs_fonts');
    if (typeof pdfMake.addVirtualFileSystem === 'function') {
      pdfMake.addVirtualFileSystem(vfsFonts);
    } else if (vfsFonts?.pdfMake?.vfs) {
      pdfMake.vfs = vfsFonts.pdfMake.vfs;
    } else {
      pdfMake.vfs = vfsFonts.default?.pdfMake?.vfs || vfsFonts.default || vfsFonts;
    }

    // Header row
    const headers = columns.map((col) => ({
      text: col.header,
      style: 'tableHeader',
      alignment: 'left',
      bold: true
    }));

    // Data rows
    const rows = dataToExport.map((item) => {
      return columns.map((col) => {
        let val = (item as any)[col.key];
        if (typeof val === "object" && val !== null) {
          val = JSON.stringify(val);
        }
        return { text: val !== undefined && val !== null ? String(val) : "", style: 'tableCell' };
      });
    });

    const body = [headers, ...rows];
    const widths = columns.map(() => '*');

    const doc: any = {
      pageSize: 'A4',
      pageOrientation: columns.length > 5 ? 'landscape' : 'portrait',
      pageMargins: [30, 30, 30, 30],
      content: [
        {
          text: exportFileName.replace(/[-_]/g, ' ').toUpperCase(),
          style: 'mainHeader',
          margin: [0, 0, 0, 15]
        },
        {
          table: {
            headerRows: 1,
            widths,
            body
          },
          layout: {
            hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 1.5 : 0.5,
            vLineWidth: (i: number, node: any) => 0.5,
            hLineColor: () => '#D1D5DB',
            vLineColor: () => '#E5E7EB',
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 6,
            paddingBottom: () => 6
          }
        }
      ],
      styles: {
        mainHeader: {
          fontSize: 16,
          bold: true,
          color: '#111827'
        },
        tableHeader: {
          fontSize: 9,
          bold: true,
          color: '#FFFFFF',
          fillColor: '#374151',
          margin: [0, 2, 0, 2]
        },
        tableCell: {
          fontSize: 8,
          color: '#374151',
          margin: [0, 2, 0, 2]
        }
      }
    };

    pdfMake.createPdf(doc).download(`${exportFileName}.pdf`);
  };

  // 5. Bulk Delete Handlers
  const openDeleteSelectedConfirm = () => {
    if (selectedIds.size === 0 || !onDeleteSelected) return;
    setDeleteTargetIds(Array.from(selectedIds));
    setConfirmDialogOpen(true);
  };

  const openDeleteAllConfirm = () => {
    if (sortedData.length === 0 || !onDeleteSelected) return;
    const allIds = sortedData.map((item) => getRowId(item));
    setDeleteTargetIds(allIds);
    setConfirmDialogOpen(true);
  };

  const executeDelete = async () => {
    if (deleteTargetIds.length === 0 || !onDeleteSelected) return;
    try {
      setIsDeleting(true);
      await onDeleteSelected(deleteTargetIds);
      setSelectedIds(new Set());
      setDeleteMode(false);
      setConfirmDialogOpen(false);
    } catch (err: any) {
      console.error("Failed to delete items:", err);
    } finally {
      setIsDeleting(false);
    }
  };

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
            className="pl-10 h-10 rounded-xl bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500"
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
        <div className="flex items-center gap-2 flex-wrap">
          {/* Delete Action — Initial / inactive delete mode */}
          {onDeleteSelected && !deleteMode && (
            <Button
              onClick={enterDeleteMode}
              variant="outline"
              className="h-10 rounded-xl px-4 flex items-center gap-2 border-red-300 dark:border-red-800/60 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 hover:border-red-400 transition-all shadow-sm font-semibold"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </Button>
          )}

          {/* Delete Actions — Active delete mode: keep Delete button visible and functional! */}
          {onDeleteSelected && deleteMode && (
            <div className="flex items-center gap-2 flex-wrap animate-in fade-in duration-200">
              {/* Delete Selected when items are chosen */}
              {selectedIds.size > 0 ? (
                <Button
                  type="button"
                  onClick={openDeleteSelectedConfirm}
                  disabled={isDeleting}
                  className="h-10 rounded-xl px-4 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete ({selectedIds.size})</span>
                </Button>
              ) : (
                /* Immediate Delete All button when 0 items chosen */
                <Button
                  type="button"
                  onClick={openDeleteAllConfirm}
                  disabled={isDeleting || sortedData.length === 0}
                  variant="outline"
                  className="h-10 rounded-xl px-4 flex items-center gap-2 border-red-400 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 hover:border-red-500 font-bold transition-all shadow-sm"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete All ({sortedData.length})</span>
                </Button>
              )}

              {/* Also show Delete All if some (but not all) are selected */}
              {selectedIds.size > 0 && selectedIds.size < sortedData.length && (
                <Button
                  type="button"
                  onClick={openDeleteAllConfirm}
                  disabled={isDeleting}
                  variant="outline"
                  className="h-10 rounded-xl px-3 text-xs font-semibold border-red-300 dark:border-red-800/60 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 transition-all"
                  title="Delete all items currently displayed"
                >
                  Delete All ({sortedData.length})
                </Button>
              )}

              {/* Cancel button to exit delete mode */}
              <Button
                type="button"
                variant="outline"
                onClick={exitDeleteMode}
                disabled={isDeleting}
                className="h-10 rounded-xl px-3 flex items-center gap-1.5 border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title="Cancel delete mode"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-10 rounded-xl px-4 flex items-center gap-2 border-input bg-background text-foreground hover:bg-muted transition-all"
              >
                <Download className="h-4 w-4" />
                <span>Export</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground">
              <DropdownMenuItem onClick={handleExport} className="cursor-pointer hover:bg-muted">
                Export to Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer hover:bg-muted">
                Export to PDF (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View Toggler (Table vs List) */}
          <div className="flex items-center bg-muted border border-border p-1 rounded-xl h-10">
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "table" ? "bg-background text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Table view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "list" ? "bg-background text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────── DELETE / SELECTION MODE BANNER ────────────────── */}
      {onDeleteSelected && deleteMode && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 px-4 rounded-2xl bg-red-500/10 border border-red-500/25 backdrop-blur-xl shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-red-500/20 text-red-600 dark:text-red-400 shrink-0">
              <Trash2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>Delete Mode Active</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                  {selectedIds.size} of {sortedData.length} selected
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Check specific rows or click "Select All" to delete. You can also click "Delete All" directly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSelectAll(!isAllSelected)}
              disabled={isDeleting || sortedData.length === 0}
              className="h-8 rounded-xl px-3 text-xs font-semibold border-border bg-background/80 hover:bg-muted"
            >
              <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
              {isAllSelected ? "Deselect All" : `Select All (${sortedData.length})`}
            </Button>

            {selectedIds.size > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={openDeleteSelectedConfirm}
                disabled={isDeleting}
                className="h-8 rounded-xl px-3.5 flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Selected ({selectedIds.size})</span>
              </Button>
            )}

            {(!isAllSelected || selectedIds.size === 0) && sortedData.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={openDeleteAllConfirm}
                disabled={isDeleting}
                variant="outline"
                className="h-8 rounded-xl px-3 flex items-center gap-1.5 border-red-400/60 text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 text-xs font-bold"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete All ({sortedData.length})</span>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={exitDeleteMode}
              disabled={isDeleting}
              className="h-8 rounded-xl px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────── CONTENT VIEW SECTION ────────────────── */}
      {viewMode === "table" ? (
        /* TABLE VIEW: Adapts dynamically to light/dark themes */
        <ScrollArea className="rounded-2xl border border-border overflow-hidden shadow-sm bg-card">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-full divide-y divide-border">
              <TableHeader className="bg-muted/50">
                <TableRow className="border-b border-border hover:bg-transparent">
                  {/* Checkbox column header — only in delete mode */}
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
                        onClick={deleteMode ? () => handleSelectRow(rowId, !isSelected) : undefined}
                        className={`border-b border-border transition-colors duration-150 ${
                          deleteMode ? "cursor-pointer" : ""
                        } ${
                          isSelected
                            ? "bg-red-50/60 dark:bg-red-950/20"
                            : "hover:bg-muted/30"
                        }`}
                      >
                        {/* Checkbox cell — only in delete mode */}
                        {deleteMode && (
                          <TableCell className="px-4 py-3 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectRow(rowId, !!checked)}
                              onClick={(e) => e.stopPropagation()}
                              className="border-border bg-background data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
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
              const onToggleSelect = () => handleSelectRow(rowId, !isSelected);

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
                      ? "border-red-500 shadow-md shadow-red-500/5 bg-red-50/30 dark:bg-red-950/20"
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
                    {/* Checkbox — only in delete mode */}
                    {deleteMode && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleSelectRow(rowId, !!checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="border-border bg-background data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500 mt-1"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ────────────────── DELETE CONFIRMATION MODAL ────────────────── */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent className="sm:max-w-md rounded-2xl border border-border bg-card">
          <AlertDialogHeader>
            <div className="w-11 h-11 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-600 dark:text-red-400 mb-1">
              <AlertCircle className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-lg font-bold text-foreground">
              {deleteTargetIds.length === sortedData.length
                ? `Delete All ${deleteTargetIds.length} Records?`
                : `Delete ${deleteTargetIds.length} Selected Record${deleteTargetIds.length > 1 ? "s" : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {deleteTargetIds.length === sortedData.length
                ? `Are you sure you want to delete all ${deleteTargetIds.length} records currently displayed? This action cannot be undone.`
                : `Are you sure you want to delete the ${deleteTargetIds.length} selected record${deleteTargetIds.length > 1 ? "s" : ""}? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setConfirmDialogOpen(false)}
              className="rounded-xl h-10 px-4"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isDeleting}
              onClick={executeDelete}
              className="h-10 rounded-xl px-5 bg-red-600 hover:bg-red-700 text-white font-bold gap-2 shadow-sm"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  <span>Delete {deleteTargetIds.length}</span>
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
