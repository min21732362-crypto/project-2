// State Management
let state = {
  token: localStorage.getItem('jwt_token') || null,
  user: JSON.parse(localStorage.getItem('user_info')) || null,
  currentRoomId: null,
  currentRoomData: null,
  pollingTimer: null,
  surveyStep: 1,
  surveyData: {
    department: '',
    student_id_prefix: '',
    gender: '',
    preferred_role: '',
    avoided_role: '',
    ppt_skill: 2,
    pres_skill: 2,
    res_skill: 2,
    relevance: 2,
    doc_skill: 2,
    comm_style: 2,
    conflict_style: 2,
    time_availability: 2,
    target_grade: 'A+',
    confirmed_role: ''
  }
};

// Local Database Simulator (for Offline / Serverless fallback)
const MockDB = {
  get(key, defaultValue = []) {
    return JSON.parse(localStorage.getItem(key)) || defaultValue;
  },
  set(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },
  init() {
    if (!localStorage.getItem('tb_users')) this.set('tb_users', []);
    if (!localStorage.getItem('tb_rooms')) this.set('tb_rooms', []);
    if (!localStorage.getItem('tb_members')) this.set('tb_members', []);
    if (!localStorage.getItem('tb_results')) this.set('tb_results', []);
  }
};
MockDB.init();

// Local Copy of Matching Algorithm for Mock DB
function parseCohort(prefix) {
  if (!prefix) return null;
  const numString = String(prefix).replace(/[^0-9]/g, '');
  if (!numString) return null;
  if (numString.length === 4) return parseInt(numString.substring(2, 4), 10);
  const val = parseInt(numString.substring(0, 2), 10);
  if (val >= 10 && val <= 30) return val;
  return null;
}

function isDesignRelated(dept) {
  if (!dept) return false;
  const normalized = dept.toLowerCase().replace(/\s+/g, '');
  const designKeywords = ['시각디자인', '디자인', '시디', '미술', '예술', '조형', 'design', 'art', 'multimedia', '멀티미디어'];
  return designKeywords.some(keyword => normalized.includes(keyword));
}

function getRolesForSize(N) {
  if (N === 2) {
    return [
      { id: 'role_1', type: 'leader', label: '조장 & 발표 (총괄/발표)', description: '조별과제 전체 진행 상황을 조율하고 자료를 최종 취합하여 발표를 진행합니다.' },
      { id: 'role_2', type: 'ppt', label: 'PPT 제작 & 자료조사', description: '발표용 PPT 템플릿 제작 및 조율, 관련 기초 및 추가 자료조사를 수행합니다.' }
    ];
  }
  if (N === 3) {
    return [
      { id: 'role_1', type: 'leader', label: '조장 & 발표 (총괄/발표)', description: '조별과제 전체 진행 상황을 조율하고 자료를 최종 취합하여 발표를 진행합니다.' },
      { id: 'role_2', type: 'ppt', label: 'PPT 제작 (디자인/수정)', description: '발표용 PPT 템플릿과 내용을 가독성 있게 시각적으로 제작합니다.' },
      { id: 'role_3', type: 'research', label: '자료조사 (취합/검색)', description: '주제 관련 기초 문헌 분석, 실증 데이터 수집 및 상세 요약 보고서를 작성합니다.' }
    ];
  }
  const roles = [];
  roles.push({ id: 'leader', type: 'leader', label: '조장 (자료취합/PM)', description: '조별과제 일정 조율, 팀원 간 업무 진행현황 확인 및 최종 자료 취합/검토를 총괄합니다.' });
  if (N === 4) {
    roles.push({ id: 'ppt', type: 'ppt', label: 'PPT 제작', description: '발표용 PPT 템플릿 디자인과 슬라이드 구성 및 시각화 작업을 주도합니다.' });
    roles.push({ id: 'presentation', type: 'presentation', label: '발표 담당', description: '최종 PPT를 기반으로 발표 대본 작성, 리허설 및 질의응답 대응을 담당합니다.' });
    roles.push({ id: 'research', type: 'research', label: '자료조사', description: '과제 주제에 맞는 핵심 정보 검색, 논문 및 통계자료 수집 및 요약본을 제공합니다.' });
  } else {
    let pptCount = 1, presCount = 1, resCount = 1;
    let remaining = N - 4;
    while (remaining > 0) {
      if (remaining > 0) { resCount++; remaining--; }
      if (remaining > 0) { pptCount++; remaining--; }
      if (remaining > 0) { presCount++; remaining--; }
    }
    for (let i = 1; i <= pptCount; i++) {
      roles.push({ id: `ppt_${i}`, type: 'ppt', label: `PPT 제작 ${pptCount > 1 ? i + '파트' : ''}`, description: `발표용 PPT 제작 및 시각화 파트 ${i}를 담당하여 협업합니다.` });
    }
    for (let i = 1; i <= presCount; i++) {
      roles.push({ id: `presentation_${i}`, type: 'presentation', label: `발표 담당 ${presCount > 1 ? i + '파트' : ''}`, description: `발표 슬라이드 대본 작성 및 스피치 파트 ${i} 발표를 조율합니다.` });
    }
    for (let i = 1; i <= resCount; i++) {
      roles.push({ id: `research_${i}`, type: 'research', label: `자료조사 ${resCount > 1 ? i + '파트' : ''}`, description: `과제 핵심 주제 조사 및 상세 논문/데이터 정리 파트 ${i}를 분석 및 공유합니다.` });
    }
  }
  return roles;
}

function localPerformMatching(members, users) {
  const N = members.length;
  const roles = getRolesForSize(N);
  const memberDetails = members.map(m => {
    const user = users.find(u => u.user_id === m.user_id) || {};
    return {
      ...m,
      nickname: user.nickname || '익명 조원',
      cohort: parseCohort(m.student_id_prefix),
      isDesign: isDesignRelated(m.department)
    };
  });

  let minCohort = null;
  memberDetails.forEach(m => {
    if (m.cohort !== null) {
      if (minCohort === null || m.cohort < minCohort) minCohort = m.cohort;
    }
  });

  function getScore(m, roleType) {
    let score = 0;
    if (roleType === 'ppt' && m.isDesign && m.preferred_role === 'ppt') score += 100.0;
    if (roleType === 'leader') {
      if (m.target_grade === 'A+') score += 5.0;
      if (m.cohort !== null && m.cohort === minCohort) score += 3.0;
    }
    if (m.time_availability === 1) {
      if (roleType === 'leader' || roleType === 'ppt') score -= 20.0;
      if (roleType === 'research' || roleType === 'presentation') score += 4.0;
    } else if (m.time_availability === 3) {
      if (roleType === 'leader' || roleType === 'ppt') score += 4.0;
    }
    
    // Skill-based & Domain Relevance adjustments (12 steps)
    if (roleType === 'ppt') {
      if (m.ppt_skill === 3) score += 4.0;
      if (m.ppt_skill === 1) score -= 10.0;
      if (m.comm_style === 3) score += 2.5;
      if (m.conflict_style === 3) score += 1.5;
    }
    if (roleType === 'presentation') {
      if (m.pres_skill === 3) score += 4.0;
      if (m.pres_skill === 1) score -= 15.0;
      if (m.comm_style === 1) score += 2.0;
      if (m.comm_style === 2) score += 1.0;
      if (m.conflict_style === 2) score += 2.0;
    }
    if (roleType === 'research') {
      if (m.res_skill === 3) score += 4.0;
      if (m.res_skill === 1) score -= 3.0;
      if (m.doc_skill === 3) score += 3.0;
      if (m.doc_skill === 1) score -= 3.0;
      if (m.comm_style === 2) score += 2.0;
      if (m.comm_style === 3) score += 1.5;
      if (m.conflict_style === 2) score += 2.0;
    }
    if (roleType === 'leader') {
      if (m.relevance === 3) score += 3.0;
      if (m.ppt_skill === 3 || m.res_skill === 3) score += 1.5;
      if (m.doc_skill === 3) score += 2.0;
      if (m.doc_skill === 1) score -= 2.0;
      if (m.comm_style === 1) score += 5.0;
      if (m.comm_style === 3) score -= 3.0;
      if (m.conflict_style === 1) score += 4.0;
    }

    if (m.preferred_role === roleType) score += 3.0;
    if (m.avoided_role === roleType) score -= 8.0;
    if (m.confirmed_role === roleType) score += 40.0;
    score += Math.random() * 0.1;
    return score;
  }

  const candidates = [];
  for (let mIdx = 0; mIdx < N; mIdx++) {
    const member = memberDetails[mIdx];
    for (let rIdx = 0; rIdx < N; rIdx++) {
      const role = roles[rIdx];
      candidates.push({ mIdx, rIdx, score: getScore(member, role.type), member, role });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const assignedMembers = new Set();
  const assignedRoles = new Set();
  const assignments = [];

  for (const cand of candidates) {
    if (!assignedMembers.has(cand.mIdx) && !assignedRoles.has(cand.rIdx)) {
      assignedMembers.add(cand.mIdx);
      assignedRoles.add(cand.rIdx);
      assignments.push({
        user_id: cand.member.user_id,
        nickname: cand.member.nickname,
        assigned_role: cand.role.label,
        assigned_duty_description: cand.role.description,
        intervened: cand.member.avoided_role === cand.role.type
      });
    }
  }
  return assignments;
}

// Local Mock HTTP Request Router
async function handleLocalMockRequest(url, options = {}) {
  if (!state.isDemo) {
    state.isDemo = true;
    showToast('💡 서버 오프라인: 데모(로컬 저장소) 모드로 자동 전환되었습니다.');
    console.log('Switched to local mock DB mode.');
  }

  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  const path = url.split('?')[0];
  const currentUserId = state.user ? state.user.user_id : null;

  // 1. Signup
  if (path === '/api/auth/signup' && method === 'POST') {
    const users = MockDB.get('tb_users');
    const existing = users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
    if (existing) throw new Error('이미 사용 중인 이메일입니다.');

    const newUser = {
      user_id: 'u_' + Math.random().toString(36).substr(2, 9),
      email: body.email.toLowerCase(),
      nickname: body.nickname,
      password: body.password,
      created_at: new Date().toISOString()
    };
    users.push(newUser);
    MockDB.set('tb_users', users);
    return { token: 'mock-token-' + newUser.user_id, user: newUser };
  }

  // 2. Login
  if (path === '/api/auth/login' && method === 'POST') {
    const users = MockDB.get('tb_users');
    const user = users.find(u => u.email.toLowerCase() === body.email.toLowerCase() && u.password === body.password);
    if (!user) throw new Error('이메일 또는 비밀번호를 잘못 입력했습니다.');
    return { token: 'mock-token-' + user.user_id, user: user };
  }

  // 3. Dashboard
  if (path === '/api/dashboard' && method === 'GET') {
    const rooms = MockDB.get('tb_rooms');
    const members = MockDB.get('tb_members');

    const createdRooms = rooms.filter(r => r.creator_id === currentUserId).map(room => {
      const roomMems = members.filter(m => m.room_id === room.room_id);
      return { ...room, members_submitted: roomMems.filter(m => m.is_completed).length, members_count: roomMems.length };
    });

    const joinedRoomIds = members.filter(m => m.user_id === currentUserId).map(m => m.room_id);
    const joinedRooms = rooms.filter(r => joinedRoomIds.includes(r.room_id) && r.creator_id !== currentUserId).map(room => {
      const roomMems = members.filter(m => m.room_id === room.room_id);
      return { ...room, members_submitted: roomMems.filter(m => m.is_completed).length, members_count: roomMems.length };
    });

    return { createdRooms, joinedRooms };
  }

  // 4. Create Room
  if (path === '/api/rooms' && method === 'POST') {
    const rooms = MockDB.get('tb_rooms');
    const members = MockDB.get('tb_members');

    const newRoom = {
      room_id: 'r_' + Math.random().toString(36).substr(2, 9),
      creator_id: currentUserId,
      subject_name: body.subject_name,
      total_members: parseInt(body.total_members, 10),
      status: 'recruiting',
      created_at: new Date().toISOString()
    };
    rooms.push(newRoom);
    MockDB.set('tb_rooms', rooms);

    const creatorMem = {
      member_id: 'm_' + Math.random().toString(36).substr(2, 9),
      room_id: newRoom.room_id,
      user_id: currentUserId,
      department: '',
      student_id_prefix: '',
      gender: '',
      preferred_role: '',
      avoided_role: '',
      time_availability: 2,
      target_grade: '',
      is_completed: false,
      joined_at: new Date().toISOString()
    };
    members.push(creatorMem);
    MockDB.set('tb_members', members);

    return newRoom;
  }

  // 5. Room Info
  const roomInfoMatch = path.match(/^\/api\/rooms\/([^\/]+)$/);
  if (roomInfoMatch && method === 'GET') {
    const roomId = roomInfoMatch[1];
    const rooms = MockDB.get('tb_rooms');
    const room = rooms.find(r => r.room_id === roomId);
    if (!room) throw new Error('방을 찾을 수 없습니다.');

    const members = MockDB.get('tb_members').filter(m => m.room_id === roomId);
    const users = MockDB.get('tb_users');
    const currentMember = members.find(m => m.user_id === currentUserId);
    const creator = users.find(u => u.user_id === room.creator_id) || {};

    const mappedMembers = members.map(m => {
      const user = users.find(u => u.user_id === m.user_id) || {};
      return { user_id: m.user_id, nickname: user.nickname || '익명 조원', is_completed: m.is_completed };
    });

    return {
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
    };
  }

  // 6. Join Room
  const joinMatch = path.match(/^\/api\/rooms\/([^\/]+)\/join$/);
  if (joinMatch && method === 'POST') {
    const roomId = joinMatch[1];
    const rooms = MockDB.get('tb_rooms');
    const room = rooms.find(r => r.room_id === roomId);
    if (!room) throw new Error('방을 찾을 수 없습니다.');
    if (room.status === 'completed') throw new Error('이미 매칭이 완료된 방입니다.');

    const members = MockDB.get('tb_members');
    const existing = members.find(m => m.room_id === roomId && m.user_id === currentUserId);
    if (existing) return { message: '이미 참가했습니다.', member: existing };

    const count = members.filter(m => m.room_id === roomId).length;
    if (count >= room.total_members) throw new Error('이미 정원이 초과된 방입니다.');

    const newMem = {
      member_id: 'm_' + Math.random().toString(36).substr(2, 9),
      room_id: roomId,
      user_id: currentUserId,
      department: '',
      student_id_prefix: '',
      gender: '',
      preferred_role: '',
      avoided_role: '',
      time_availability: 2,
      target_grade: '',
      is_completed: false,
      joined_at: new Date().toISOString()
    };
    members.push(newMem);
    MockDB.set('tb_members', members);
    return { message: '방에 참가하였습니다.', member: newMem };
  }

  // 7. Submit Survey
  const surveyMatch = path.match(/^\/api\/rooms\/([^\/]+)\/survey$/);
  if (surveyMatch && method === 'POST') {
    const roomId = surveyMatch[1];
    const rooms = MockDB.get('tb_rooms');
    const room = rooms.find(r => r.room_id === roomId);
    if (!room) throw new Error('방을 찾을 수 없습니다.');

    const members = MockDB.get('tb_members');
    const member = members.find(m => m.room_id === roomId && m.user_id === currentUserId);
    if (!member) throw new Error('이 방의 멤버가 아닙니다.');

    member.department = body.department || '';
    member.student_id_prefix = body.student_id_prefix || '';
    member.gender = body.gender || '';
    member.preferred_role = body.preferred_role || '';
    member.avoided_role = body.avoided_role || '';
    member.time_availability = parseInt(body.time_availability, 10) || 2;
    member.target_grade = body.target_grade || '';
    member.is_completed = true;
    MockDB.set('tb_members', members);

    const roomMems = members.filter(m => m.room_id === roomId);
    const allCompleted = roomMems.length === room.total_members && roomMems.every(m => m.is_completed);

    if (allCompleted) {
      const users = MockDB.get('tb_users');
      const assignments = localPerformMatching(roomMems, users);
      
      const results = MockDB.get('tb_results').filter(res => res.room_id !== roomId);
      assignments.forEach(a => {
        results.push({
          room_id: roomId,
          user_id: a.user_id,
          assigned_role: a.assigned_role,
          assigned_duty_description: a.assigned_duty_description
        });
      });
      MockDB.set('tb_results', results);

      room.status = 'completed';
      room.intervened = assignments.some(a => a.intervened);
      MockDB.set('tb_rooms', rooms);
    }

    return { message: '설문이 제출되었습니다.', allCompleted };
  }

  // 8. Get Results
  const resultMatch = path.match(/^\/api\/rooms\/([^\/]+)\/result$/);
  if (resultMatch && method === 'GET') {
    const roomId = resultMatch[1];
    const rooms = MockDB.get('tb_rooms');
    const room = rooms.find(r => r.room_id === roomId);
    if (!room) throw new Error('방을 찾을 수 없습니다.');
    if (room.status !== 'completed') throw new Error('아직 매칭 전입니다.');

    const results = MockDB.get('tb_results').filter(res => res.room_id === roomId);
    const users = MockDB.get('tb_users');
    const mappedResults = results.map(res => {
      const u = users.find(user => user.user_id === res.user_id) || {};
      const mem = MockDB.get('tb_members').find(m => m.room_id === roomId && m.user_id === res.user_id) || {};
      return {
        user_id: res.user_id,
        nickname: u.nickname || '익명 조원',
        assigned_role: res.assigned_role,
        assigned_duty_description: res.assigned_duty_description,
        intervened: mem.avoided_role === res.assigned_role
      };
    });

    return {
      subject_name: room.subject_name,
      intervened: room.intervened || false,
      results: mappedResults
    };
  }

  // 9. Demo Mock Filler
  const mockFillMatch = path.match(/^\/api\/rooms\/([^\/]+)\/mock-fill$/);
  if (mockFillMatch && method === 'POST') {
    const roomId = mockFillMatch[1];
    const rooms = MockDB.get('tb_rooms');
    const room = rooms.find(r => r.room_id === roomId);
    if (!room) throw new Error('방을 찾을 수 없습니다.');

    const members = MockDB.get('tb_members');
    const users = MockDB.get('tb_users');
    const currentMembers = members.filter(m => m.room_id === roomId);

    const needed = room.total_members - currentMembers.length;
    if (needed <= 0) return { success: true };

    const mockProfiles = [
      { name: '김시디', dept: '시각디자인학과', id: '21', gender: 'W', pref: 'ppt', avoid: 'presentation', time: 3, grade: 'A+', ppt_skill: 3, pres_skill: 2, res_skill: 1, relevance: 2, doc_skill: 2, comm_style: 3, conflict_style: 3 },
      { name: '이경영', dept: '경영학과', id: '20', gender: 'M', pref: 'leader', avoid: 'ppt', time: 1, grade: 'A+', ppt_skill: 2, pres_skill: 3, res_skill: 3, relevance: 3, doc_skill: 3, comm_style: 1, conflict_style: 1 },
      { name: '박컴공', dept: '컴퓨터공학과', id: '22', gender: 'M', pref: 'presentation', avoid: 'leader', time: 2, grade: 'Pass', ppt_skill: 2, pres_skill: 3, res_skill: 2, relevance: 2, doc_skill: 2, comm_style: 1, conflict_style: 2 },
      { name: '최화공', dept: '화학공학과', id: '23', gender: 'W', pref: 'research', avoid: 'leader', time: 1, grade: 'Pass', ppt_skill: 1, pres_skill: 1, res_skill: 3, relevance: 2, doc_skill: 3, comm_style: 2, conflict_style: 2 },
      { name: '윤행정', dept: '행정학과', id: '21', gender: 'W', pref: 'research', avoid: 'ppt', time: 2, grade: 'Pass', ppt_skill: 2, pres_skill: 2, res_skill: 3, relevance: 2, doc_skill: 3, comm_style: 2, conflict_style: 3 },
      { name: '정연극', dept: '연극영화학과', id: '19', gender: 'M', pref: 'presentation', avoid: 'ppt', time: 3, grade: 'A+', ppt_skill: 1, pres_skill: 3, res_skill: 2, relevance: 2, doc_skill: 1, comm_style: 1, conflict_style: 1 },
      { name: '강디자인', dept: '디자인학부', id: '22', gender: 'W', pref: 'ppt', avoid: 'leader', time: 2, grade: 'A+', ppt_skill: 3, pres_skill: 2, res_skill: 2, relevance: 2, doc_skill: 2, comm_style: 3, conflict_style: 3 },
      { name: '조생명', dept: '생명과학과', id: '23', gender: 'M', pref: 'research', avoid: 'presentation', time: 2, grade: 'Pass', ppt_skill: 2, pres_skill: 1, res_skill: 3, relevance: 2, doc_skill: 2, comm_style: 3, conflict_style: 2 },
      { name: '임영문', dept: '영어영문학과', id: '20', gender: 'W', pref: 'research', avoid: 'leader', time: 2, grade: 'Pass', ppt_skill: 2, pres_skill: 2, res_skill: 3, relevance: 2, doc_skill: 3, comm_style: 2, conflict_style: 2 }
    ];

    for (let i = 0; i < needed; i++) {
      const profile = mockProfiles[i % mockProfiles.length];
      const mockUser = {
        user_id: 'mu_' + Math.random().toString(36).substr(2, 9),
        email: `mock_${i}_${roomId}@daejin.ac.kr`,
        nickname: profile.name,
        password: 'password123',
        created_at: new Date().toISOString()
      };
      users.push(mockUser);

      const mockMem = {
        member_id: 'mm_' + Math.random().toString(36).substr(2, 9),
        room_id: roomId,
        user_id: mockUser.user_id,
        department: profile.dept,
        student_id_prefix: profile.id,
        gender: profile.gender,
        preferred_role: profile.pref,
        avoided_role: profile.avoid,
        ppt_skill: profile.ppt_skill,
        pres_skill: profile.pres_skill,
        res_skill: profile.res_skill,
        relevance: profile.relevance,
        doc_skill: profile.doc_skill,
        comm_style: profile.comm_style,
        conflict_style: profile.conflict_style,
        time_availability: profile.time,
        target_grade: profile.grade,
        is_completed: true,
        joined_at: new Date().toISOString()
      };
      members.push(mockMem);
    }

    MockDB.set('tb_users', users);
    MockDB.set('tb_members', members);

    const updatedMems = members.filter(m => m.room_id === roomId);
    const assignments = localPerformMatching(updatedMems, users);

    const results = MockDB.get('tb_results').filter(res => res.room_id !== roomId);
    assignments.forEach(a => {
      results.push({
        room_id: roomId,
        user_id: a.user_id,
        assigned_role: a.assigned_role,
        assigned_duty_description: a.assigned_duty_description
      });
    });
    MockDB.set('tb_results', results);

    room.status = 'completed';
    room.intervened = assignments.some(a => a.intervened);
    MockDB.set('tb_rooms', rooms);

    return { success: true };
  }

  throw new Error('Not Found');
}

// API Helper with Offline Fallback
async function apiFetch(url, options = {}) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {})
    };

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        logout();
        throw new Error('인증 오류가 발생했습니다. 다시 로그인해주세요.');
      }
      throw new Error(data.error || '오류가 발생했습니다.');
    }

    return data;
  } catch (err) {
    // If server is offline, fallback to Local Mock Database
    return await handleLocalMockRequest(url, options);
  }
}

// Session Helpers
function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('jwt_token', token);
  localStorage.setItem('user_info', JSON.stringify(user));
  document.getElementById('logout-btn').classList.remove('hide');
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('user_info');
  document.getElementById('logout-btn').classList.add('hide');
  stopWaitingPolling();
  window.location.hash = '#landing';
}

// Navigation & Routing
const routes = {
  landing: 'landing-screen',
  login: 'login-screen',
  signup: 'register-screen',
  dashboard: 'dashboard-screen',
  'create-room': 'create-room-screen',
  room: 'waiting-screen',
  survey: 'survey-screen',
  result: 'result-screen',
  'survey-report': 'survey-report-screen'
};

function navigate() {
  const hash = window.location.hash || '#landing';
  stopWaitingPolling(); // Always stop polling when navigating

  // Parse hash parameters
  const parts = hash.substring(1).split('/');
  const routeName = parts[0];
  const param = parts[1] || null;

  // Authentication guards
  const publicRoutes = ['landing', 'login', 'signup'];
  const isAuthenticated = !!state.token;

  // Deep Link interception
  if (routeName === 'room' && param && !isAuthenticated) {
    sessionStorage.setItem('pending_room_id', param);
    showScreen('login');
    window.location.hash = '#login';
    return;
  }

  if (!isAuthenticated && !publicRoutes.includes(routeName)) {
    window.location.hash = '#landing';
    return;
  }

  if (isAuthenticated && publicRoutes.includes(routeName)) {
    window.location.hash = '#dashboard';
    return;
  }

  // Handle Screens
  if (routeName === 'room' && param) {
    state.currentRoomId = param;
    loadRoomDetails(param);
  } else if (routeName === 'survey' && param) {
    state.currentRoomId = param;
    startSurveyFlow();
  } else if (routeName === 'survey-report' && param) {
    state.currentRoomId = param;
    if (!state.surveyData.department) {
      window.location.hash = `#survey/${param}`;
      return;
    }
    generateDiagnosis();
  } else if (routeName === 'dashboard') {
    loadDashboardData();
  }

  const screenId = routes[routeName] || 'landing-screen';
  showScreen(screenId);
}

function showScreen(screenId) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  
  // Show target screen
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
  }
}

// Initialize Router
window.addEventListener('hashchange', navigate);
window.addEventListener('DOMContentLoaded', () => {
  if (state.token) {
    document.getElementById('logout-btn').classList.remove('hide');
  }
  navigate();
  setupValidationListeners();

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker Registered!', reg))
      .catch(err => console.error('Service Worker registration failed:', err));
  }
});

// Event Listeners for Logout & Logo Click
document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('header-logo').addEventListener('click', () => {
  if (state.token) {
    window.location.hash = '#dashboard';
  } else {
    window.location.hash = '#landing';
  }
});

// Input Validation Helper
function setupValidationListeners() {
  // Login Validation
  const loginEmail = document.getElementById('login-email');
  const loginPass = document.getElementById('login-password');
  const loginBtn = document.getElementById('login-submit-btn');

  function validateLogin() {
    if (loginEmail.value.trim() && loginPass.value.trim()) {
      loginBtn.disabled = false;
      loginBtn.className = 'btn btn-primary btn-lg btn-block';
    } else {
      loginBtn.disabled = true;
      loginBtn.className = 'btn btn-disabled btn-lg btn-block';
    }
  }
  loginEmail.addEventListener('input', validateLogin);
  loginPass.addEventListener('input', validateLogin);

  // Signup Validation
  const signupNick = document.getElementById('signup-nickname');
  const signupEmail = document.getElementById('signup-email');
  const signupPass = document.getElementById('signup-password');
  const signupBtn = document.getElementById('signup-submit-btn');

  function validateSignup() {
    if (signupNick.value.trim() && signupEmail.value.trim() && signupPass.value.trim()) {
      signupBtn.disabled = false;
      signupBtn.className = 'btn btn-primary btn-lg btn-block';
    } else {
      signupBtn.disabled = true;
      signupBtn.className = 'btn btn-disabled btn-lg btn-block';
    }
  }
  signupNick.addEventListener('input', validateSignup);
  signupEmail.addEventListener('input', validateSignup);
  signupPass.addEventListener('input', validateSignup);

  // Room Creation Validation
  const roomSubject = document.getElementById('room-subject');
  const createRoomBtn = document.getElementById('create-room-submit-btn');

  roomSubject.addEventListener('input', () => {
    if (roomSubject.value.trim().length > 0 && roomSubject.value.length <= 20) {
      createRoomBtn.disabled = false;
      createRoomBtn.className = 'btn btn-primary btn-lg btn-block';
    } else {
      createRoomBtn.disabled = true;
      createRoomBtn.className = 'btn btn-disabled btn-lg btn-block';
    }
  });
}

// Landing Flow
document.getElementById('start-btn').addEventListener('click', () => {
  if (state.token) {
    window.location.hash = '#dashboard';
  } else {
    window.location.hash = '#login';
  }
});

// Login Flow
document.getElementById('go-to-signup').addEventListener('click', () => window.location.hash = '#signup');
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  errorEl.classList.add('hide');

  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    saveSession(data.token, data.user);
    
    const pendingRoomId = sessionStorage.getItem('pending_room_id');
    if (pendingRoomId) {
      sessionStorage.removeItem('pending_room_id');
      try {
        await apiFetch(`/api/rooms/${pendingRoomId}/join`, { method: 'POST' });
      } catch (joinErr) {
        console.warn('Failed auto-join, room might be full or user already joined:', joinErr);
      }
      window.location.hash = `#room/${pendingRoomId}`;
    } else {
      window.location.hash = '#dashboard';
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hide');
  }
});

// Signup Flow
document.getElementById('go-to-login').addEventListener('click', () => window.location.hash = '#login');
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = document.getElementById('signup-nickname').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');

  errorEl.classList.add('hide');

  // Email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errorEl.textContent = '올바른 이메일 형식이 아닙니다.';
    errorEl.classList.remove('hide');
    return;
  }

  // Password complexity check (letter + number, min 8 chars)
  const pwdRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
  if (!pwdRegex.test(password)) {
    errorEl.textContent = '비밀번호는 영문과 숫자를 조합하여 최소 8자 이상이어야 합니다.';
    errorEl.classList.remove('hide');
    return;
  }

  try {
    const data = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ nickname, email, password })
    });

    saveSession(data.token, data.user);

    const pendingRoomId = sessionStorage.getItem('pending_room_id');
    if (pendingRoomId) {
      sessionStorage.removeItem('pending_room_id');
      try {
        await apiFetch(`/api/rooms/${pendingRoomId}/join`, { method: 'POST' });
      } catch (joinErr) {
        console.warn('Failed auto-join, room might be full or user already joined:', joinErr);
      }
      window.location.hash = `#room/${pendingRoomId}`;
    } else {
      window.location.hash = '#dashboard';
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hide');
  }
});

// Dashboard Flows
async function loadDashboardData() {
  document.getElementById('user-nickname-placeholder').textContent = state.user ? state.user.nickname : '조원';
  
  const createdList = document.getElementById('created-rooms-list');
  const joinedList = document.getElementById('joined-rooms-list');
  
  createdList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>로딩 중...</p></div>';
  joinedList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>로딩 중...</p></div>';

  try {
    const data = await apiFetch('/api/dashboard');
    
    // Render Created Rooms
    if (data.createdRooms.length === 0) {
      createdList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-folder-open"></i>
          <p>아직 개설한 팀플 방이 없습니다.</p>
        </div>`;
    } else {
      createdList.innerHTML = data.createdRooms.map(room => renderRoomCard(room)).join('');
    }

    // Render Joined Rooms
    if (data.joinedRooms.length === 0) {
      joinedList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-users-slash"></i>
          <p>아직 참가한 팀플 방이 없습니다.</p>
        </div>`;
    } else {
      joinedList.innerHTML = data.joinedRooms.map(room => renderRoomCard(room)).join('');
    }
  } catch (err) {
    createdList.innerHTML = `<div class="empty-state"><p class="error-msg">${err.message}</p></div>`;
    joinedList.innerHTML = `<div class="empty-state"><p class="error-msg">${err.message}</p></div>`;
  }
}

function renderRoomCard(room) {
  const isCompleted = room.status === 'completed';
  const statusLabel = isCompleted ? '매칭 완료' : '조원 모집 중';
  const statusClass = isCompleted ? 'completed' : 'recruiting';
  const createdDate = new Date(room.created_at).toLocaleDateString('ko-KR');

  return `
    <div class="room-card animate-hover" onclick="window.location.hash='#room/${room.room_id}'">
      <div class="room-card-header">
        <h3 class="room-subject">${escapeHtml(room.subject_name)}</h3>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="room-card-info">
        <span><i class="fa-solid fa-calendar-days"></i> ${createdDate}</span>
        <span><i class="fa-solid fa-user-group"></i> ${room.members_submitted}/${room.total_members}명 설문 완료</span>
      </div>
    </div>
  `;
}

// Tabs switching on Dashboard
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.rooms-tab-content').forEach(c => c.classList.remove('active'));

    e.target.classList.add('active');
    const tabName = e.target.dataset.tab;
    document.getElementById(`${tabName}-rooms-area`).classList.add('active');
  });
});

document.getElementById('create-room-btn').addEventListener('click', () => window.location.hash = '#create-room');

// Room Creation Flow
document.getElementById('back-to-dashboard-btn').addEventListener('click', () => window.location.hash = '#dashboard');
document.getElementById('create-room-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const subjectName = document.getElementById('room-subject').value;
  const totalMembers = document.querySelector('input[name="total_members"]:checked').value;
  const errorEl = document.getElementById('create-room-error');

  errorEl.classList.add('hide');

  try {
    const room = await apiFetch('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ subject_name: subjectName, total_members: totalMembers })
    });

    window.location.hash = `#room/${room.room_id}`;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hide');
  }
});

// Waiting Room & Polling Flow
document.getElementById('waiting-back-btn').addEventListener('click', () => window.location.hash = '#dashboard');

async function loadRoomDetails(roomId) {
  try {
    const room = await apiFetch(`/api/rooms/${roomId}`);
    state.currentRoomData = room;

    if (room.status === 'completed') {
      stopWaitingPolling();
      loadResults(roomId);
      showScreen('result-screen');
      window.location.hash = `#result/${roomId}`;
      return;
    }

    // Update Room Info UI
    document.getElementById('waiting-subject-title').textContent = room.subject_name;
    document.getElementById('total-target-count').textContent = room.total_members;
    
    const inviteLink = `${window.location.origin}/#room/${room.room_id}`;
    document.getElementById('invite-link-input').value = inviteLink;

    // Render Members Joined Status
    renderMembersStatus(room);

    // Setup action buttons based on status
    const isSurveyCompleted = room.current_member_submitted;
    const surveyBtn = document.getElementById('go-to-survey-btn');
    const resultsBtn = document.getElementById('waiting-results-btn');

    if (!isSurveyCompleted) {
      surveyBtn.classList.remove('hide');
      surveyBtn.onclick = () => window.location.hash = `#survey/${room.room_id}`;
      resultsBtn.classList.add('hide');
    } else {
      surveyBtn.classList.add('hide');
      resultsBtn.classList.remove('hide');
      resultsBtn.disabled = true;
      resultsBtn.className = 'btn btn-disabled btn-lg btn-block';
      resultsBtn.textContent = '다른 조원들 응답 대기 중';
    }

    // Setup mock filler button for offline demo testing
    const mockBtn = document.getElementById('add-mock-members-btn');
    if (state.isDemo && room.members.length < room.total_members) {
      mockBtn.classList.remove('hide');
      mockBtn.onclick = async () => {
        try {
          await apiFetch(`/api/rooms/${room.room_id}/mock-fill`, { method: 'POST' });
          showToast('가상 팀원들이 참여하고 매칭이 완료되었습니다!');
          loadRoomDetails(room.room_id);
        } catch (err) {
          alert(err.message);
        }
      };
    } else {
      mockBtn.classList.add('hide');
    }

    // Start Real-time status polling
    startWaitingPolling(roomId);
  } catch (err) {
    alert(err.message);
    window.location.hash = '#dashboard';
  }
}

function renderMembersStatus(room) {
  const membersList = document.getElementById('waiting-members-list');
  const countSubmitted = room.members.filter(m => m.is_completed).length;
  
  document.getElementById('submitted-count').textContent = countSubmitted;
  const pct = Math.round((countSubmitted / room.total_members) * 100);
  document.getElementById('progress-percentage').textContent = `${pct}%`;
  document.getElementById('waiting-progress-fill').style.width = `${pct}%`;

  const descText = document.getElementById('progress-description-text');
  if (pct === 100) {
    descText.innerHTML = '<span class="text-primary font-bold">모든 조원이 설문을 마쳤습니다! 매칭을 확인하세요.</span>';
  } else {
    descText.textContent = `정원 ${room.total_members}명 중 현재 ${countSubmitted}명이 설문을 마쳤어요.`;
  }

  membersList.innerHTML = room.members.map(member => {
    const isMe = member.user_id === state.user.user_id;
    const nameLabel = isMe ? `${escapeHtml(member.nickname)} (나)` : escapeHtml(member.nickname);
    const statusText = member.is_completed 
      ? '<span class="status-check done"><i class="fa-solid fa-circle-check"></i> 완료</span>'
      : '<span class="status-check pending"><i class="fa-solid fa-circle-notch fa-spin"></i> 대기</span>';
    
    return `
      <li class="member-status-item">
        <span class="name-box"><i class="fa-solid fa-user"></i> ${nameLabel}</span>
        ${statusText}
      </li>
    `;
  }).join('');

  // Auto-fill empty slots
  const emptySlotsCount = room.total_members - room.members.length;
  for (let i = 0; i < emptySlotsCount; i++) {
    membersList.innerHTML += `
      <li class="member-status-item" style="opacity: 0.5;">
        <span class="name-box"><i class="fa-solid fa-user-plus"></i> 팀원 모집 중...</span>
        <span class="status-check pending">미진입</span>
      </li>
    `;
  }
}

function startWaitingPolling(roomId) {
  stopWaitingPolling();
  state.pollingTimer = setInterval(async () => {
    try {
      const room = await apiFetch(`/api/rooms/${roomId}`);
      state.currentRoomData = room;

      if (room.status === 'completed') {
        stopWaitingPolling();
        loadResults(roomId);
        showScreen('result-screen');
        window.location.hash = `#result/${roomId}`;
        return;
      }

      renderMembersStatus(room);
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 2500);
}

function stopWaitingPolling() {
  if (state.pollingTimer) {
    clearInterval(state.pollingTimer);
    state.pollingTimer = null;
  }
}

// Invite Link Copy
document.getElementById('copy-link-btn').addEventListener('click', () => {
  const inviteInput = document.getElementById('invite-link-input');
  inviteInput.select();
  inviteInput.setSelectionRange(0, 99999);
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(inviteInput.value).then(() => {
      showToast('초대 링크가 복사되었습니다!');
    });
  } else {
    document.execCommand('copy');
    showToast('초대 링크가 복사되었습니다!');
  }
});

function showToast(msg) {
  // Simple toast alert
  const alertDiv = document.createElement('div');
  alertDiv.style.position = 'fixed';
  alertDiv.style.bottom = '80px';
  alertDiv.style.left = '50%';
  alertDiv.style.transform = 'translateX(-50%)';
  alertDiv.style.backgroundColor = 'rgba(17, 24, 39, 0.9)';
  alertDiv.style.color = '#FFFFFF';
  alertDiv.style.padding = '12px 24px';
  alertDiv.style.borderRadius = '30px';
  alertDiv.style.fontSize = '14px';
  alertDiv.style.fontWeight = '600';
  alertDiv.style.zIndex = '9999';
  alertDiv.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3)';
  alertDiv.style.transition = 'opacity 0.3s ease';
  alertDiv.textContent = msg;

  document.body.appendChild(alertDiv);

  setTimeout(() => {
    alertDiv.style.opacity = '0';
    setTimeout(() => alertDiv.remove(), 300);
  }, 2000);
}

function generateDiagnosis() {
  const data = state.surveyData;
    const isDesign = isDesignRelated(data.department);
    
    let profileTitle = '성실한 올라운드 서포터';
    let profileDesc = '어떤 역할이든 묵묵하게 조력하여 팀 전체의 성공을 이끌어 냅니다.';
    let recommendedRole = 'research';
    let avatarIcon = 'fa-solid fa-hands-helping';

    // 12단계에 걸친 세밀한 성향 진단
    if (isDesign && parseInt(data.ppt_skill, 10) === 3) {
      profileTitle = '트렌디한 시각화 마스터';
      profileDesc = '디자인 전공 역량과 뛰어난 PPT 제작 스킬로 발표용 자료를 최고 수준으로 시각화합니다.';
      recommendedRole = 'ppt';
      avatarIcon = 'fa-solid fa-palette';
    } else if (parseInt(data.pres_skill, 10) === 3 && data.preferred_role === 'presentation') {
      profileTitle = '무대를 지배하는 스피커';
      profileDesc = '우수한 스피치 능력과 높은 발표 자신감으로 청중을 매료시키는 프레젠테이션을 이끕니다.';
      recommendedRole = 'presentation';
      avatarIcon = 'fa-solid fa-microphone-lines';
    } else if (parseInt(data.res_skill, 10) === 3 && parseInt(data.doc_skill, 10) === 3) {
      profileTitle = '학술 데이터 전문 리서처';
      profileDesc = '논문 및 학술 DB 검색 능력과 뛰어난 문서 작성력으로 방대한 양의 데이터를 정제 요약합니다.';
      recommendedRole = 'research';
      avatarIcon = 'fa-solid fa-graduation-cap';
    } else if (data.target_grade === 'A+' && data.preferred_role === 'leader' && parseInt(data.comm_style, 10) === 1) {
      profileTitle = '팀을 이끄는 캐리형 리더';
      profileDesc = '높은 학점 성취 의지, 적극적인 의사소통 스타일로 전체 일정을 주도하고 과제를 총괄 리드합니다.';
      recommendedRole = 'leader';
      avatarIcon = 'fa-solid fa-crown';
    } else if (parseInt(data.conflict_style, 10) === 1 && parseInt(data.comm_style, 10) === 2) {
      profileTitle = '화합을 이끄는 피스메이커';
      profileDesc = '팀원 간 갈등을 중재하고 조율하며, 적극적인 소통과 배려로 원만한 팀 분위기를 유지시킵니다.';
      recommendedRole = 'leader';
      avatarIcon = 'fa-solid fa-heart';
    } else if (data.time_availability === 1) {
      profileTitle = '치고 빠지는 핀포인트 요원';
      profileDesc = '시간적 여유는 부족하지만 개별 요약 정리나 대본 리허설 등 독립적인 파트에서 1인분을 해냅니다.';
      recommendedRole = (data.preferred_role === 'presentation') ? 'presentation' : 'research';
      avatarIcon = 'fa-solid fa-user-ninja';
    }

    // Update DOM Elements
    document.getElementById('diagnosis-title-text').textContent = profileTitle;
    document.getElementById('diagnosis-desc-text').textContent = profileDesc;
    document.getElementById('diagnosis-avatar-box').innerHTML = `<i class="${avatarIcon}"></i>`;
    
    document.getElementById('trait-commitment').textContent = data.target_grade === 'A+' ? 'A+ 멱살캐리형' : 'Pass 만족형';
    
    let timeText = '보통';
    if (data.time_availability === 1) timeText = '바쁨/매우 바쁨';
    if (data.time_availability === 3) timeText = '매우 여유';
    document.getElementById('trait-time').textContent = timeText;
    
    document.getElementById('trait-design').textContent = isDesign ? '디자인 전공 (우수)' : '일반 학과 (보통)';

    // New Trait UI data mapping
    let commText = '경청 및 조율';
    if (parseInt(data.comm_style, 10) === 1) commText = '주도적 의견 정리';
    if (parseInt(data.comm_style, 10) === 3) commText = '묵묵한 실무 집중';
    document.getElementById('trait-comm').textContent = commText;

    let docText = '중 (일반 수준)';
    if (parseInt(data.doc_skill, 10) === 3) docText = '상 (구조화 마스터)';
    if (parseInt(data.doc_skill, 10) === 1) docText = '하 (글쓰기 서툼)';
    document.getElementById('trait-doc').textContent = docText;

    let conflictText = '객관적 논리 팩트';
    if (parseInt(data.conflict_style, 10) === 1) conflictText = '적극적 갈등 중재';
    if (parseInt(data.conflict_style, 10) === 3) conflictText = '원만한 합의 수용';
    document.getElementById('trait-conflict').textContent = conflictText;

    const radio = document.getElementById(`conf-${recommendedRole}`);
    if (radio) {
      radio.checked = true;
    }
  }

  // Survey Step-by-Step Flow Event Listeners
  document.getElementById('survey-back-btn').addEventListener('click', () => {
    if (state.surveyStep > 1) {
      showSurveyStep(state.surveyStep - 1);
    } else {
      window.location.hash = `#room/${state.currentRoomId}`;
    }
  });

  document.getElementById('survey-next-btn').addEventListener('click', () => {
    if (validateCurrentStep()) {
      saveCurrentStepData();
      showSurveyStep(state.surveyStep + 1);
    }
  });

  document.getElementById('survey-prev-btn').addEventListener('click', () => {
    if (state.surveyStep > 1) {
      showSurveyStep(state.surveyStep - 1);
    }
  });

  document.getElementById('survey-submit-btn').addEventListener('click', () => {
    if (validateCurrentStep()) {
      saveCurrentStepData();
      window.location.hash = `#survey-report/${state.currentRoomId}`;
    }
  });

  document.getElementById('confirm-diagnosis-btn').addEventListener('click', async () => {
    const checkedRadio = document.querySelector('input[name="confirmed_role"]:checked');
    const confirmedRole = checkedRadio ? checkedRadio.value : 'research';
    state.surveyData.confirmed_role = confirmedRole;

    try {
      const result = await apiFetch(`/api/rooms/${state.currentRoomId}/survey`, {
        method: 'POST',
        body: JSON.stringify(state.surveyData)
      });

      if (result.allCompleted) {
        window.location.hash = `#result/${state.currentRoomId}`;
      } else {
        window.location.hash = `#room/${state.currentRoomId}`;
      }
    } catch (err) {
      alert(err.message);
    }
  });

  // Real-time button active states in survey
  document.querySelectorAll('#survey-screen input').forEach(input => {
    input.addEventListener('change', updateSurveyBtnState);
    input.addEventListener('input', updateSurveyBtnState);
  });

  function updateSurveyBtnState() {
    const isValid = validateCurrentStep();
    const nextBtn = document.getElementById('survey-next-btn');
    const submitBtn = document.getElementById('survey-submit-btn');

    if (isValid) {
      nextBtn.disabled = false;
      nextBtn.className = 'btn btn-primary btn-lg btn-block';
      submitBtn.disabled = false;
      submitBtn.className = 'btn btn-primary btn-lg btn-block';
    } else {
      nextBtn.disabled = true;
      nextBtn.className = 'btn btn-disabled btn-lg btn-block';
      submitBtn.disabled = true;
      submitBtn.className = 'btn btn-disabled btn-lg btn-block';
    }
  }

  // Validation and Save Helpers for 12 Steps
  function validateCurrentStep() {
    if (state.surveyStep === 1) {
      const dept = document.getElementById('survey-dept').value.trim();
      return dept.length > 0;
    }
    if (state.surveyStep === 2) {
      const cohort = document.getElementById('survey-cohort').value.trim();
      return cohort.length >= 2;
    }
    if (state.surveyStep === 3) {
      return !!document.querySelector('input[name="survey_gender"]:checked');
    }
    if (state.surveyStep === 4) {
      const pref = document.querySelector('input[name="survey_pref"]:checked');
      const avoid = document.querySelector('input[name="survey_avoid"]:checked');
      if (!pref || !avoid) return false;
      return pref.value !== avoid.value;
    }
    if (state.surveyStep === 5) {
      return !!document.querySelector('input[name="survey_ppt_skill"]:checked');
    }
    if (state.surveyStep === 6) {
      return !!document.querySelector('input[name="survey_pres_skill"]:checked');
    }
    if (state.surveyStep === 7) {
      return !!document.querySelector('input[name="survey_res_skill"]:checked');
    }
    if (state.surveyStep === 8) {
      return !!document.querySelector('input[name="survey_relevance"]:checked');
    }
    if (state.surveyStep === 9) {
      return !!document.querySelector('input[name="survey_doc_skill"]:checked');
    }
    if (state.surveyStep === 10) {
      return !!document.querySelector('input[name="survey_comm_style"]:checked');
    }
    if (state.surveyStep === 11) {
      return !!document.querySelector('input[name="survey_conflict_style"]:checked');
    }
    if (state.surveyStep === 12) {
      const time = document.querySelector('input[name="survey_time"]:checked');
      const grade = document.querySelector('input[name="survey_grade"]:checked');
      return !!time && !!grade;
    }
    return false;
  }

  function saveCurrentStepData() {
    if (state.surveyStep === 1) {
      state.surveyData.department = document.getElementById('survey-dept').value.trim();
    } else if (state.surveyStep === 2) {
      state.surveyData.student_id_prefix = document.getElementById('survey-cohort').value.trim();
    } else if (state.surveyStep === 3) {
      state.surveyData.gender = document.querySelector('input[name="survey_gender"]:checked').value;
    } else if (state.surveyStep === 4) {
      state.surveyData.preferred_role = document.querySelector('input[name="survey_pref"]:checked').value;
      state.surveyData.avoided_role = document.querySelector('input[name="survey_avoid"]:checked').value;
    } else if (state.surveyStep === 5) {
      state.surveyData.ppt_skill = parseInt(document.querySelector('input[name="survey_ppt_skill"]:checked').value, 10);
    } else if (state.surveyStep === 6) {
      state.surveyData.pres_skill = parseInt(document.querySelector('input[name="survey_pres_skill"]:checked').value, 10);
    } else if (state.surveyStep === 7) {
      state.surveyData.res_skill = parseInt(document.querySelector('input[name="survey_res_skill"]:checked').value, 10);
    } else if (state.surveyStep === 8) {
      state.surveyData.relevance = parseInt(document.querySelector('input[name="survey_relevance"]:checked').value, 10);
    } else if (state.surveyStep === 9) {
      state.surveyData.doc_skill = parseInt(document.querySelector('input[name="survey_doc_skill"]:checked').value, 10);
    } else if (state.surveyStep === 10) {
      state.surveyData.comm_style = parseInt(document.querySelector('input[name="survey_comm_style"]:checked').value, 10);
    } else if (state.surveyStep === 11) {
      state.surveyData.conflict_style = parseInt(document.querySelector('input[name="survey_conflict_style"]:checked').value, 10);
    } else if (state.surveyStep === 12) {
      state.surveyData.time_availability = parseInt(document.querySelector('input[name="survey_time"]:checked').value, 10);
      state.surveyData.target_grade = document.querySelector('input[name="survey_grade"]:checked').value;
    }
  }

  function startSurveyFlow() {
    state.surveyStep = 1;
    state.surveyData = {
      department: '',
      student_id_prefix: '',
      gender: '',
      preferred_role: '',
      avoided_role: '',
      ppt_skill: 2,
      pres_skill: 2,
      res_skill: 2,
      relevance: 2,
      doc_skill: 2,
      comm_style: 2,
      conflict_style: 2,
      time_availability: 2,
      target_grade: 'A+',
      confirmed_role: ''
    };
    
    // Reset text inputs
    document.getElementById('survey-dept').value = '';
    document.getElementById('survey-cohort').value = '';
    
    // Uncheck all radios
    document.querySelectorAll('#survey-screen input[type="radio"]').forEach(r => r.checked = false);
    
    // Set default radio choices
    document.getElementById('time-normal').checked = true;
    document.getElementById('grade-a').checked = true;
    document.getElementById('ppt-skill-mid').checked = true;
    document.getElementById('pres-skill-mid').checked = true;
    document.getElementById('res-skill-mid').checked = true;
    document.getElementById('relevance-mid').checked = true;
    document.getElementById('doc-skill-mid').checked = true;
    document.getElementById('comm-moderate').checked = true;
    document.getElementById('conflict-logical').checked = true;

    showSurveyStep(1);
  }

  function showSurveyStep(step) {
    state.surveyStep = step;
    
    // Update progress bar (12 steps)
    const pct = (step / 12) * 100;
    document.getElementById('survey-progress-bar').style.width = `${pct}%`;
    document.getElementById('survey-step-num').textContent = `${step}/12`;

    // Toggle active survey screen step
    document.querySelectorAll('.survey-step').forEach(s => s.classList.remove('active'));
    const targetStep = document.querySelector(`.survey-step[data-step="${step}"]`);
    if (targetStep) {
      targetStep.classList.add('active');
    }

    const prevBtn = document.getElementById('survey-prev-btn');
    const nextBtn = document.getElementById('survey-next-btn');
    const submitBtn = document.getElementById('survey-submit-btn');

    if (step === 1) {
      prevBtn.classList.add('hide');
      nextBtn.classList.remove('hide');
      submitBtn.classList.add('hide');
    } else if (step === 12) {
      prevBtn.classList.remove('hide');
      nextBtn.classList.add('hide');
      submitBtn.classList.remove('hide');
    } else {
      prevBtn.classList.remove('hide');
      nextBtn.classList.remove('hide');
      submitBtn.classList.add('hide');
    }

    updateSurveyBtnState();
  }

// Result Screen Flow
document.getElementById('result-dashboard-btn').addEventListener('click', () => window.location.hash = '#dashboard');

async function loadResults(roomId) {
  try {
    const data = await apiFetch(`/api/rooms/${roomId}/result`);
    
    document.getElementById('result-subject-name').textContent = data.subject_name;

    // Show intervention banner if required
    const banner = document.getElementById('result-intervened-alert');
    if (data.intervened) {
      banner.classList.remove('hide');
    } else {
      banner.classList.add('hide');
    }

    // Render cards
    const container = document.getElementById('results-cards-container');
    container.innerHTML = data.results.map(res => {
      const isMe = res.user_id === state.user.user_id;
      const nameText = isMe ? `${escapeHtml(res.nickname)} (나)` : escapeHtml(res.nickname);
      const isIntervenedUser = res.intervened ? '<span class="status-badge alert-warning ml-2" style="font-size: 10px; padding: 2px 6px;">개입됨</span>' : '';
      
      return `
        <div class="result-member-card">
          <div class="result-member-header">
            <span class="result-member-name"><i class="fa-solid fa-circle-user"></i> ${nameText} ${isIntervenedUser}</span>
            <span class="result-role-tag">${escapeHtml(res.assigned_role)}</span>
          </div>
          <p class="result-duty-desc">${escapeHtml(res.assigned_duty_description)}</p>
        </div>
      `;
    }).join('');

    // Setup results copying text
    setupResultsCopying(data);
  } catch (err) {
    alert(err.message);
    window.location.hash = '#dashboard';
  }
}

function setupResultsCopying(data) {
  const copyBtn = document.getElementById('copy-result-text-btn');
  
  let copyText = `📚 [대진대 팀플 밸런서] ${data.subject_name} 역할 배정 결과\n\n`;
  if (data.intervened) {
    copyText += `⚠️ 모두의 기피 항목 조율을 위해 시스템 밸런서가 개입하여 최종 배정되었습니다.\n\n`;
  }
  
  data.results.forEach((res, i) => {
    copyText += `${i + 1}. ${res.nickname} - [${res.assigned_role}]\n   업무: ${res.assigned_duty_description}\n\n`;
  });

  copyText += `공정하게 분배 완료! 끝까지 파이팅 넘치게 진행해 봅시다. 💪`;

  copyBtn.onclick = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(copyText).then(() => {
        showToast('결과 텍스트가 복사되었습니다!');
      });
    } else {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = copyText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      showToast('결과 텍스트가 복사되었습니다!');
    }
  };
}

// Escape HTML Utility to prevent XSS
function escapeHtml(string) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    "/": '&#x2F;'
  };
  const reg = /[&<>"'/]/ig;
  return String(string).replace(reg, (match) => map[match]);
}
