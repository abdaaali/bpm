import React from 'react';
import { Box, Typography, Alert, Card, CardContent } from '@mui/material';
import { Notifications } from '@mui/icons-material';

export default function NotificationsPage() {
  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>Notifications</Typography>
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 6 }}>
          <Notifications sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No notifications yet</Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>
            You will receive notifications here when work orders are assigned, updated, or require action.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
