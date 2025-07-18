import { useState } from "react";
import {
  LocalizationProvider,
  DatePicker,
  TimePicker,
} from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import thLocale from "date-fns/locale/th";
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Dialog,
  Select,
  MenuItem,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
export default function Home() {
  const [tripFee, setTripFee] = useState("");
  const [oilClaim, setOilClaim] = useState("");
  const [openDialog, setOpenDialog] = useState(true);
  const [inputPassword, setInputPassword] = useState("");
  const [bank, setBank] = useState("");
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [date, setSelectedDate] = useState(new Date());
  const [standbyTime, setStandbyTime] = useState(null);
  const [departTime, setDepartTime] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');


  const handleTripFeeChange = (e) => {
    let value = e.target.value;
    value = value.replace(/[^0-9]/g, '');
    setTripFee(value);
    const fee = parseFloat(value) || 0;
    setOilClaim((fee * 0.5).toFixed(2));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const data = new FormData(e.target);
    const obj = Object.fromEntries(data.entries());
    const formattedOil = parseFloat(oilClaim || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    obj.oil_claim = formattedOil;
    obj.account_number = accountNumber
    // console.log( JSON.stringify(obj))
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj),
    });

    if (res.ok) {
      setSuccessDialogOpen(true);
      setAccountNumber("")
      setTripFee("");
      setOilClaim("");
      setSelectedDate(new Date());
      setStandbyTime(null);
      setDepartTime(null);
      setBank("");
      e.target.reset();
    } else {
      // handle error
      alert("เกิดข้อผิดพลาดในการส่งข้อมูล");
    }
    setIsSubmitting(false); // หยุดโหลด
  };
  const handleAccountNumberChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, ''); // เอาเฉพาะตัวเลข
    setAccountNumber(value);
  };
  const handlePasswordCheck = async () => {
    const res = await fetch("/api/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: inputPassword }),
    });

    const result = await res.json();

    if (result.valid) {
      setOpenDialog(false);
    } else {
      alert("❌ รหัสผิด ลองใหม่อีกครั้ง");
      setInputPassword("");
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 5 }}>
      <Box textAlign="center" mb={2}>
        <img
          src="https://www.dropbox.com/scl/fi/vh73i9yg9zgx0kicb9vrj/logo.jpg?rlkey=o20qqqr3bml6m52y5rxo9m272&st=tbtvqrni&raw=1"
          style={{ maxWidth: "120px" }}
          alt="logo"
        />
      </Box>

      <Typography variant="h5" gutterBottom>
        ฟอร์มแจ้งเบิกน้ำมัน
      </Typography>
      <Dialog
        open={successDialogOpen}
        onClose={() => setSuccessDialogOpen(false)}
      >
        <DialogTitle>ส่งข้อมูลสำเร็จ 🎉</DialogTitle>
        <DialogContent>
          <Typography>ระบบได้รับข้อมูลเรียบร้อยแล้ว</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuccessDialogOpen(false)}>ปิด</Button>
        </DialogActions>
      </Dialog>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          overflowY: "auto",
          flexGrow: 1,
          pr: 1,
          "&::-webkit-scrollbar": { width: "8px" },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "#888",
            borderRadius: "4px",
          },
        }}
      >
        <LocalizationProvider
          dateAdapter={AdapterDateFns}
          adapterLocale={thLocale}
        >
          <Box sx={{ mt: 2, color: "black" }}>
            <DatePicker
              name="date"
              label="เลือกวันที่"
              value={date}
              onChange={(newValue) => setSelectedDate(newValue)}
              renderInput={(params) => (
                <TextField fullWidth {...params} required />
              )}
            />
          </Box>
        </LocalizationProvider>
        <TextField
          fullWidth
          label="ชื่อ 🙋"
          name="name"
          margin="normal"
          required
        />
        <TextField
          fullWidth
          label="ทะเบียนรถ 🚛"
          name="car_no"
          margin="normal"
          required
        />
        <TextField
          fullWidth
          label="เบอร์โทร 📞"
          name="phone"
          margin="normal"
          type="number"
          required
        />
        <TextField
          fullWidth
          label="เลขบาร์ 📦"
          name="barcode"
          margin="normal"
          required
        />
        <TextField
          fullWidth
          label="เส้นทาง 📍"
          name="route"
          margin="normal"
          required
        />
        <TextField
          fullWidth
          label="รอบเวลาสแตนบาย ⏰"
          name="standby_round"
          margin="normal"
          required
        />
        <LocalizationProvider
          dateAdapter={AdapterDateFns}
          adapterLocale={thLocale}
        >
          <Box sx={{ mt: 1 }}>
            <TimePicker
              label="เวลาสแตนบาย"
              name="standby_time"
              value={standbyTime}
              onChange={(newValue) => setStandbyTime(newValue)}
              renderInput={(params) => (
                <TextField fullWidth margin="normal" required {...params} />
              )}
            />
          </Box>
        </LocalizationProvider>
        <LocalizationProvider
          dateAdapter={AdapterDateFns}
          adapterLocale={thLocale}
        >
          <Box sx={{ mt: 2 }}>
            <TimePicker
              label="ออกเดินทาง"
              name="depart_time"
              value={departTime}
              onChange={(newValue) => setDepartTime(newValue)}
              renderInput={(params) => (
                <TextField fullWidth margin="normal" required {...params} />
              )}
            />
          </Box>
        </LocalizationProvider>
        <TextField
          fullWidth
          label="หมายเหตุ"
          name="remark"
          margin="normal"
          multiline
          rows={3}
        />
        <TextField
          fullWidth
          label="ค่าเที่ยว (บาท)"
          name="trip_fee"
          value={tripFee ? parseInt(tripFee).toLocaleString() : ''}
          onChange={handleTripFeeChange}
          margin="normal"
          // type="number"
          required
        />
        <TextField
          fullWidth
          label="เบิกน้ำมัน (บาท)"
          value={
            oilClaim
              ? parseFloat(oilClaim).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : ''
          }
          margin="normal"
          slotProps={{ input: { readOnly: true } }}
        />
        <FormControl fullWidth margin="normal" required>
          <InputLabel id="bank-label">บัญชีธนาคาร 🏦</InputLabel>
          <Select
            labelId="bank-label"
            name="bank"
            value={bank}
            label="บัญชีธนาคาร 🏦"
            onChange={(e) => setBank(e.target.value)}
          >
            <MenuItem value="กรุงไทย">กรุงไทย</MenuItem>
            <MenuItem value="กสิกรไทย">กสิกรไทย</MenuItem>
            <MenuItem value="ไทยพาณิชย์">ไทยพาณิชย์</MenuItem>
            <MenuItem value="กรุงเทพ">กรุงเทพ</MenuItem>
            <MenuItem value="กรุงศรี">กรุงศรี</MenuItem>
            <MenuItem value="อาคารสงเคราะห์">อาคารสงเคราะห์</MenuItem>
            <MenuItem value="ทหารไทยธนชาต (TTB)">ทหารไทยธนชาต (TTB)</MenuItem>
            <MenuItem value="ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร(ธ.ก.ส.)">ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร(ธ.ก.ส.)</MenuItem>
            <MenuItem value="ออมสิน">ออมสิน</MenuItem>
            <MenuItem value="เกียรตินาคิน">เกียรตินาคิน</MenuItem>
            <MenuItem value="ซีไอเอ็มบี">ซีไอเอ็มบี</MenuItem>
            <MenuItem value="ยูโอบี">ยูโอบี</MenuItem>
          </Select>
        </FormControl>
        <TextField
          fullWidth
          label="ชื่อบัญชี"
          name="account_name"
          margin="normal"
          required
        />
        <TextField
          fullWidth
          label="เลขบัญชี"
          name="account_number"
          margin="normal"
          required
          value={accountNumber}
          onChange={handleAccountNumberChange}
          slotProps={{
            input: {
              inputMode: 'numeric'
            }
          }}
        />
        <Button
          variant="contained"
          type="submit"
          fullWidth
          sx={{ mt: 2 }}
          disabled={isSubmitting}
        >
          {isSubmitting ? "กำลังส่ง..." : "ส่งข้อมูล"}
        </Button>
      </Box>

      {/* Dialog popup */}
      <Dialog
        slotProps={{
          paper: {
            sx: {
              position: "absolute",
              top: 80,
              padding: 3,
              m: 0,
              borderRadius: 2,
            },
          },
        }}
        open={openDialog}
        disableEscapeKeyDown
        disableBackdropClick
      >
        <DialogTitle>กรุณากรอกรหัสผ่าน</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="รหัสผ่าน"
            type="password"
            fullWidth
            value={inputPassword}
            onChange={(e) => setInputPassword(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePasswordCheck} variant="contained">
            ตรวจสอบ
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
