const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'data.json');

let db = {
  users: [],
  rooms: [],
  members: [],
  results: []
};

// Helper to generate UUID
function generateId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

// Password hashing utility
function hashPassword(password) {
  const salt = 'daejin_balancer_salt_2026';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

// Load database from file
function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(content);
      db.users = parsed.users || [];
      db.rooms = parsed.rooms || [];
      db.members = parsed.members || [];
      db.results = parsed.results || [];
    } else {
      save();
    }
  } catch (err) {
    console.error('Failed to load DB file, initializing empty:', err);
  }
}

// Save database to file
function save() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write DB file:', err);
  }
}

// Database Operations

// Users
const Users = {
  create(email, password, nickname) {
    const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('AlreadyExists');
    }
    const user = {
      user_id: generateId(),
      email: email.toLowerCase(),
      password_hash: hashPassword(password),
      nickname: nickname,
      created_at: new Date().toISOString()
    };
    db.users.push(user);
    save();
    return user;
  },

  findByEmail(email) {
    return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  },

  findById(userId) {
    return db.users.find(u => u.user_id === userId);
  },

  verifyPassword(user, password) {
    return user.password_hash === hashPassword(password);
  }
};

// Rooms
const Rooms = {
  create(creatorId, subjectName, totalMembers) {
    const room = {
      room_id: generateId(),
      creator_id: creatorId,
      subject_name: subjectName,
      total_members: parseInt(totalMembers, 10),
      status: 'recruiting', // 'recruiting' or 'completed'
      created_at: new Date().toISOString()
    };
    db.rooms.push(room);
    save();
    return room;
  },

  findById(roomId) {
    return db.rooms.find(r => r.room_id === roomId);
  },

  findCreatedBy(userId) {
    return db.rooms
      .filter(r => r.creator_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  findJoinedBy(userId) {
    // Find rooms where user is a member but not the creator (or is creator but registered as member too)
    // Actually, dashboard shows "joined rooms" and "created rooms".
    // Let's filter rooms where user is in members but NOT creator.
    const roomIds = db.members
      .filter(m => m.user_id === userId)
      .map(m => m.room_id);
    
    return db.rooms
      .filter(r => roomIds.includes(r.room_id) && r.creator_id !== userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  updateStatus(roomId, status) {
    const room = this.findById(roomId);
    if (room) {
      room.status = status;
      save();
    }
    return room;
  }
};

// Members (participants in a room)
const Members = {
  add(roomId, userId) {
    const existing = db.members.find(m => m.room_id === roomId && m.user_id === userId);
    if (existing) {
      return existing;
    }

    const room = Rooms.findById(roomId);
    if (!room) {
      throw new Error('RoomNotFound');
    }

    const count = db.members.filter(m => m.room_id === roomId).length;
    if (count >= room.total_members) {
      throw new Error('RoomFull');
    }

    const member = {
      member_id: generateId(),
      room_id: roomId,
      user_id: userId,
      department: '',
      student_id_prefix: '',
      gender: '',
      preferred_role: '',
      avoided_role: '',
      time_availability: 2,
      target_grade: '',
      ppt_skill: 2,
      pres_skill: 2,
      res_skill: 2,
      relevance: 2,
      doc_skill: 2,
      comm_style: 2,
      conflict_style: 2,
      confirmed_role: '',
      is_completed: false,
      joined_at: new Date().toISOString()
    };
    db.members.push(member);
    save();
    return member;
  },

  submitSurvey(roomId, userId, data) {
    const member = db.members.find(m => m.room_id === roomId && m.user_id === userId);
    if (!member) {
      throw new Error('MemberNotFound');
    }

    member.department = data.department || '';
    member.student_id_prefix = data.student_id_prefix || '';
    member.gender = data.gender || '';
    member.preferred_role = data.preferred_role || '';
    member.avoided_role = data.avoided_role || '';
    member.time_availability = parseInt(data.time_availability, 10) || 2;
    member.target_grade = data.target_grade || '';
    member.ppt_skill = parseInt(data.ppt_skill, 10) || 2;
    member.pres_skill = parseInt(data.pres_skill, 10) || 2;
    member.res_skill = parseInt(data.res_skill, 10) || 2;
    member.relevance = parseInt(data.relevance, 10) || 2;
    member.doc_skill = parseInt(data.doc_skill, 10) || 2;
    member.comm_style = parseInt(data.comm_style, 10) || 2;
    member.conflict_style = parseInt(data.conflict_style, 10) || 2;
    member.confirmed_role = data.confirmed_role || '';
    member.is_completed = true;
    save();
    return member;
  },

  findByRoomAndUser(roomId, userId) {
    return db.members.find(m => m.room_id === roomId && m.user_id === userId);
  },

  findInRoom(roomId) {
    return db.members.filter(m => m.room_id === roomId);
  }
};

// Results
const Results = {
  save(roomId, assignments) {
    // Clear any previous results
    db.results = db.results.filter(r => r.room_id !== roomId);

    assignments.forEach(a => {
      db.results.push({
        room_id: roomId,
        user_id: a.user_id,
        assigned_role: a.assigned_role,
        assigned_duty_description: a.assigned_duty_description
      });
    });
    
    // Also save if the matcher intervened
    const room = Rooms.findById(roomId);
    if (room) {
      room.intervened = assignments.some(a => a.intervened);
    }

    save();
  },

  findForRoom(roomId) {
    return db.results.filter(r => r.room_id === roomId);
  }
};

// Periodically clean up rooms older than 30 days
function cleanupExpiredRooms() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffTime = thirtyDaysAgo.getTime();

  const expiredRoomIds = db.rooms
    .filter(r => new Date(r.created_at).getTime() < cutoffTime)
    .map(r => r.room_id);

  if (expiredRoomIds.length > 0) {
    console.log(`Cleaning up ${expiredRoomIds.length} expired rooms...`);
    db.rooms = db.rooms.filter(r => !expiredRoomIds.includes(r.room_id));
    db.members = db.members.filter(m => !expiredRoomIds.includes(m.room_id));
    db.results = db.results.filter(r => !expiredRoomIds.includes(r.room_id));
    save();
  }
}

// Load DB on startup
load();

// Run cleanup immediately on startup, and then every 24 hours
cleanupExpiredRooms();
setInterval(cleanupExpiredRooms, 24 * 60 * 60 * 1000);

module.exports = {
  Users,
  Rooms,
  Members,
  Results,
  cleanupExpiredRooms,
  _db: db // Exposed for testing
};
