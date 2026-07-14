import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';

export default function KPIStatCard({
  label, value, sub, color = 'primary.main',
}: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <Card sx={{ width: '100%', height: '100%' }}>
      <CardContent>
        <Typography variant="h3" sx={{ color, fontWeight: 700, lineHeight: 1 }}>{value ?? '—'}</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>{label}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}
