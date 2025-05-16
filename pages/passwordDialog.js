import * as React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';

export default function PasswordDialog({ open, onClose, onConfirm, password, setPassword }) {
  return (
    <Dialog 
     open={open} 
     onClose={onClose}>
      <DialogTitle>กรุณากรอกรหัสผ่าน</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="รหัสผ่าน"
          type="password"
          fullWidth
          variant="standard"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button onClick={onConfirm}>ตกลง</Button>
      </DialogActions>
    </Dialog>
  );
}