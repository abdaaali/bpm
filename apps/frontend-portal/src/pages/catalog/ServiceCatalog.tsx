/**
 * Service Catalog — Ivanti-style portal for browsing and requesting services.
 * Shows all active process definitions as catalog items grouped by category.
 * Route: /catalog
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  Box, Typography, Card, CardContent, CardActions, Button, Grid,
  TextField, InputAdornment, Chip, CircularProgress, Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BugReportIcon from '@mui/icons-material/BugReport';
import ChangeCircleIcon from '@mui/icons-material/ChangeCircle';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import SecurityIcon from '@mui/icons-material/Security';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ComputerIcon from '@mui/icons-material/Computer';
import StorageIcon from '@mui/icons-material/Storage';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { processApi } from '../../api/client';
import { FALLBACK_FORMS } from '../process-studio/startFormHelpers';
import BackButton from '../../components/BackButton';

// Requests still awaiting completion — mirrors MyRequests.tsx's OPEN_STATUSES.
export const OPEN_CASE_STATUSES = ['new', 'open', 'in_progress', 'pending_approval', 'approved'];

// ── Category / icon helpers ──────────────────────────────────────────────────

interface CategoryMeta {
  label: string;
  color: string;
  bg: string;
  Icon: React.ElementType;
}

function deriveCategory(def: any): string {
  const s = (def.slug + ' ' + def.name).toLowerCase();
  if (s.includes('incident') || s.includes('alarm') || s.includes('outage')) return 'IT Operations';
  if (s.includes('change') || s.includes('deploy') || s.includes('release') || s.includes('patch')) return 'Change Management';
  if (s.includes('purchase') || s.includes('procurement') || s.includes('expense') || s.includes('vendor')) return 'Finance & Procurement';
  if (s.includes('hr') || s.includes('onboard') || s.includes('offboard') || s.includes('employee') || s.includes('leave')) return 'HR & People';
  if (s.includes('access') || s.includes('permission') || s.includes('vpn') || s.includes('account') || s.includes('password')) return 'Access & Identity';
  if (s.includes('hardware') || s.includes('laptop') || s.includes('device') || s.includes('equipment')) return 'Hardware & Equipment';
  if (s.includes('server') || s.includes('storage') || s.includes('database') || s.includes('infra')) return 'Infrastructure';
  return 'General Services';
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  'IT Operations':         { label: 'IT Operations',        color: '#d32f2f', bg: '#ffebee', Icon: BugReportIcon },
  'Change Management':     { label: 'Change Management',    color: '#1565c0', bg: '#e3f2fd', Icon: ChangeCircleIcon },
  'Finance & Procurement': { label: 'Finance & Procurement',color: '#2e7d32', bg: '#e8f5e9', Icon: ShoppingCartIcon },
  'HR & People':           { label: 'HR & People',          color: '#6a1b9a', bg: '#f3e5f5', Icon: PeopleAltIcon },
  'Access & Identity':     { label: 'Access & Identity',    color: '#e65100', bg: '#fff3e0', Icon: SecurityIcon },
  'Hardware & Equipment':  { label: 'Hardware & Equipment', color: '#00695c', bg: '#e0f2f1', Icon: ComputerIcon },
  'Infrastructure':        { label: 'Infrastructure',       color: '#37474f', bg: '#eceff1', Icon: StorageIcon },
  'General Services':      { label: 'General Services',     color: '#455a64', bg: '#f5f5f5', Icon: AccountTreeIcon },
};

function getServiceDesc(def: any): string {
  if (def.description) return def.description;
  return FALLBACK_FORMS[def.slug]?.description || 'Submit a request for this service.';
}

function getEstTime(category: string): string {
  const times: Record<string, string> = {
    'IT Operations': '~1 hour',
    'Change Management': '3–5 business days',
    'Finance & Procurement': '2–5 business days',
    'HR & People': '5–7 business days',
    'Access & Identity': '~4 hours',
    'Hardware & Equipment': '5–10 business days',
    'Infrastructure': '2–5 business days',
    'General Services': '1–3 business days',
  };
  return times[category] || '1–3 business days';
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ServiceCatalog() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery(
    'catalog-defs',
    () => processApi.listDefs(1, 100),
    { staleTime: 60_000 },
  );

  const allDefs: any[] = (data?.data || []).filter((d: any) => d.status === 'active');

  const filtered = allDefs.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (d.name + ' ' + d.slug + ' ' + (d.description || '')).toLowerCase().includes(q);
  });

  // Group by category
  const grouped: Record<string, any[]> = {};
  filtered.forEach(def => {
    const cat = deriveCategory(def);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(def);
  });
  const categories = Object.keys(grouped).sort();

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      {/* ── Header ── */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4" fontWeight={700}>Service Catalog</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Browse available services and submit requests
          </Typography>
        </Box>

        <TextField
          fullWidth
          placeholder="Search services… (e.g. VPN, laptop, change request)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
          }}
          sx={{ maxWidth: 520 }}
        />
      </Box>

      {isLoading && (
        <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>
      )}

      {!isLoading && filtered.length === 0 && (
        <Box textAlign="center" mt={8}>
          <Typography color="text.secondary">No services found{search ? ` for "${search}"` : ''}.</Typography>
        </Box>
      )}

      {/* ── Category sections ── */}
      {categories.map(cat => {
        const meta = CATEGORY_META[cat] || CATEGORY_META['General Services'];
        const CatIcon = meta.Icon;
        return (
          <Box key={cat} mb={5}>
            {/* Category header */}
            <Box display="flex" alignItems="center" gap={1.5} mb={2}>
              <Box sx={{
                width: 32, height: 32, borderRadius: '50%',
                bgcolor: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CatIcon sx={{ fontSize: 18, color: meta.color }} />
              </Box>
              <Typography variant="h6" fontWeight={600}>{meta.label}</Typography>
              <Chip label={grouped[cat].length} size="small" sx={{ bgcolor: meta.bg, color: meta.color }} />
            </Box>
            <Divider sx={{ mb: 2 }} />

            <Grid container spacing={2}>
              {grouped[cat].map(def => {
                const estTime = getEstTime(cat);
                const desc = getServiceDesc(def);
                return (
                  <Grid item xs={12} sm={6} md={4} key={def.id}>
                    <Card sx={{
                      height: '100%', display: 'flex', flexDirection: 'column',
                      border: '1px solid', borderColor: 'divider',
                      transition: 'all 0.15s',
                      '&:hover': { boxShadow: 4, borderColor: meta.color },
                    }}>
                      <CardContent sx={{ flex: 1 }}>
                        {/* Service icon + name */}
                        <Box display="flex" alignItems="flex-start" gap={1.5} mb={1.5}>
                          <Box sx={{
                            width: 40, height: 40, borderRadius: 1.5,
                            bgcolor: meta.bg, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', flexShrink: 0,
                          }}>
                            <CatIcon sx={{ fontSize: 22, color: meta.color }} />
                          </Box>
                          <Box>
                            <Typography variant="subtitle1" fontWeight={600} lineHeight={1.2}>
                              {def.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Est. {estTime}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Description */}
                        <Typography variant="body2" color="text.secondary"
                          sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {desc}
                        </Typography>
                      </CardContent>

                      <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
                        <Button
                          fullWidth
                          variant="contained"
                          endIcon={<ArrowForwardIcon />}
                          sx={{ bgcolor: meta.color, '&:hover': { bgcolor: meta.color, opacity: 0.9 } }}
                          onClick={() => navigate(`/catalog/${def.id}/new`)}
                        >
                          Request
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        );
      })}
    </Box>
  );
}
