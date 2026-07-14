import React from 'react';
import { Table, TableHead, TableBody, TableRow, TableCell, TablePagination, Box, CircularProgress } from '@mui/material';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
}

export default function DataTable<T>({
  columns, rows, rowKey, onRowClick, loading, emptyState, page, pageSize, total, onPageChange,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyState: React.ReactNode;
  // Omit all four together for an unpaginated list (e.g. a short, fixed set
  // of rows with no server-side paging) — the footer simply isn't rendered.
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}) {
  return (
    <>
      {loading ? (
        <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
      ) : (
        <Table sx={{ '& .MuiTableCell-root': { py: 1.5 } }}>
          <TableHead sx={{ bgcolor: 'action.hover' }}>
            <TableRow>
              {columns.map(c => <TableCell key={c.key} align={c.align}>{c.label}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={rowKey(row)} hover={!!onRowClick} sx={onRowClick ? { cursor: 'pointer' } : undefined}
                onClick={() => onRowClick?.(row)}>
                {columns.map(c => <TableCell key={c.key} align={c.align}>{c.render(row)}</TableCell>)}
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={columns.length}>{emptyState}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      {total !== undefined && page !== undefined && pageSize !== undefined && onPageChange && (
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => onPageChange(p)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[pageSize]}
        />
      )}
    </>
  );
}
