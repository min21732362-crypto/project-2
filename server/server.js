const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { performMatching } = require('./matcher');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'daejin_balancer_jwt_secret_2026';

app.use(cors());
app.use(express.json());

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, '../public')));

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않거나 만료된 토큰입니다.' });
    }
    req.user = user;
    next();
  });
}

// APIs

// [F1] Signup
app.post('/api/auth/signup', (req, res) => {
  const { email, password, nickname } = req.body;

  if (!email || !password || !nickname) {
    return res.status(400).json({ error: '모든 필드를 입력해 주세요.' });
  }

  // Email validation: simple regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' });
  }

  // Password validation: english letter + number combination, min 8 chars
  const pwdRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
  if (!pwdRegex.test(password)) {
    return res.status(400).json({ error: '비밀번호는 영문과 숫자를 조합하여 최소 8자 이상이어야 합니다.' });
  }

  try {
    const user = db.Users.create(email, password, nickname);
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, nickname: user.nickname },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.status(201).json({
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        nickname: user.nickname
      }
    });
  } catch (err) {
    if (err.message === 'AlreadyExists') {
      return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// [F1] Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해 주세요.' });
  }

  const user = db.Users.findByEmail(email);
  if (!user || !db.Users.verifyPassword(user, password)) {
    // Security best practice: generic error message
    return res.status(400).json({ error: '이메일 또는 비밀번호를 잘못 입력했습니다.' });
  }

  const token = jwt.sign(
    { user_id: user.user_id, email: user.email, nickname: user.nickname },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    token,
    user: {
      user_id: user.user_id,
      email: user.email,
      nickname: user.nickname
    }
  });
});

// Get User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// [F2] Dashboard data (Created & Joined rooms)
app.get('/api/dashboard', authenticateToken, (req, res) => {
  const userId = req.user.user_id;

  const createdRooms = db.Rooms.findCreatedBy(userId).map(room => {
    const members = db.Members.findInRoom(room.room_id);
    const completedCount = members.filter(m => m.is_completed).length;
    return {
      ...room,
      members_submitted: completedCount,
      members_count: members.length
    };
  });

  const joinedRooms = db.Rooms.findJoinedBy(userId).map(room => {
    const members = db.Members.findInRoom(room.room_id);
    const completedCount = members.filter(m => m.is_completed).length;
    return {
      ...room,
      members_submitted: completedCount,
      members_count: members.length
    };
  });

  res.json({ createdRooms, joinedRooms });
});

// [F3] Create Teamplay Room
app.post('/api/rooms', authenticateToken, (req, res) => {
  const { subject_name, total_members } = req.body;
  const creatorId = req.user.user_id;

  if (!subject_name || !total_members) {
    return res.status(400).json({ error: '과목명과 총 인원수를 설정해 주세요.' });
  }

  if (subject_name.length > 20) {
    return res.status(400).json({ error: '과목명은 최대 20자까지 가능합니다.' });
  }

  const membersCount = parseInt(total_members, 10);
  if (isNaN(membersCount) || membersCount < 2 || membersCount > 10) {
    return res.status(400).json({ error: '참여 총 인원수는 최소 2명에서 최대 10명까지 가능합니다.' });
  }

  try {
    const room = db.Rooms.create(creatorId, subject_name, membersCount);
    // Add creator as first member automatically
    db.Members.add(room.room_id, creatorId);
    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ error: '방을 생성하지 못했습니다.' });
  }
});

// Get Room Information (Can be checked when logged in)
app.get('/api/rooms/:room_id', authenticateToken, (req, res) => {
  const roomId = req.params.room_id;
  const userId = req.user.user_id;

  const room = db.Rooms.findById(roomId);
  if (!room) {
    return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  }

  const members = db.Members.findInRoom(roomId);
  const currentMember = db.Members.findByRoomAndUser(roomId, userId);

  // Get user details for nicknames
  const mappedMembers = members.map(m => {
    const user = db.Users.findById(m.user_id) || {};
    return {
      user_id: m.user_id,
      nickname: user.nickname || '익명 조원',
      is_completed: m.is_completed
    };
  });

  const creator = db.Users.findById(room.creator_id) || {};

  res.json({
    room_id: room.room_id,
    subject_name: room.subject_name,
    total_members: room.total_members,
    status: room.status,
    created_at: room.created_at,
    creator_nickname: creator.nickname || '익명 조장',
    intervened: room.intervened || false,
    members: mappedMembers,
    is_member: !!currentMember,
    current_member_submitted: currentMember ? currentMember.is_completed : false
  });
});

// [F3] Join Teamplay Room (via Invite Link)
app.post('/api/rooms/:room_id/join', authenticateToken, (req, res) => {
  const roomId = req.params.room_id;
  const userId = req.user.user_id;

  const room = db.Rooms.findById(roomId);
  if (!room) {
    return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  }

  if (room.status === 'completed') {
    return res.status(400).json({ error: '이미 매칭이 완료된 방입니다.' });
  }

  try {
    const member = db.Members.add(roomId, userId);
    res.json({ message: '방에 참가하였습니다.', member });
  } catch (err) {
    if (err.message === 'RoomFull') {
      return res.status(400).json({ error: '이미 정원이 초과된 방입니다.' });
    }
    res.status(500).json({ error: '방 참가에 실패했습니다.' });
  }
});

// [F4/F5] Submit Survey and auto-match if room is full
app.post('/api/rooms/:room_id/survey', authenticateToken, (req, res) => {
  const roomId = req.params.room_id;
  const userId = req.user.user_id;
  const surveyData = req.body;

  const room = db.Rooms.findById(roomId);
  if (!room) {
    return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  }

  if (room.status === 'completed') {
    return res.status(400).json({ error: '이미 매칭이 완료된 방입니다.' });
  }

  const member = db.Members.findByRoomAndUser(roomId, userId);
  if (!member) {
    return res.status(403).json({ error: '이 방의 멤버가 아닙니다.' });
  }

  try {
    db.Members.submitSurvey(roomId, userId, surveyData);

    const members = db.Members.findInRoom(roomId);
    const allCompleted = members.length === room.total_members && members.every(m => m.is_completed);

    if (allCompleted) {
      // Fetch full user objects to pass to matcher for nicknames
      const allUsers = members.map(m => db.Users.findById(m.user_id));
      const assignments = performMatching(members, allUsers);
      
      // Save results to Database
      db.Results.save(roomId, assignments);
      db.Rooms.updateStatus(roomId, 'completed');
    }

    res.json({
      message: '설문이 성공적으로 제출되었습니다.',
      allCompleted
    });
  } catch (err) {
    res.status(500).json({ error: '설문 제출 도중 서버 오류가 발생했습니다.' });
  }
});

// [F5] Get Final Matched Results
app.get('/api/rooms/:room_id/result', authenticateToken, (req, res) => {
  const roomId = req.params.room_id;
  const userId = req.user.user_id;

  const room = db.Rooms.findById(roomId);
  if (!room) {
    return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  }

  if (room.status !== 'completed') {
    return res.status(400).json({ error: '아직 역할 매칭이 완료되지 않았습니다.' });
  }

  const member = db.Members.findByRoomAndUser(roomId, userId);
  if (!member) {
    return res.status(403).json({ error: '이 방의 멤버가 아닙니다.' });
  }

  const results = db.Results.findForRoom(roomId);
  res.json({
    subject_name: room.subject_name,
    intervened: room.intervened || false,
    results: results
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Daejin Balancer server is running on http://localhost:${PORT}`);
});
