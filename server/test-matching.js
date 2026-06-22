const { performMatching } = require('./matcher');

// Test Case 1: Standard Room Size 4 with clean profiles
const users1 = [
  { user_id: 'u1', nickname: '김디자인' },
  { user_id: 'u2', nickname: '이조장' },
  { user_id: 'u3', nickname: '박발표' },
  { user_id: 'u4', nickname: '최바쁨' }
];

const members1 = [
  {
    user_id: 'u1',
    department: '시각디자인학과',
    student_id_prefix: '22',
    gender: 'W',
    preferred_role: 'ppt',
    avoided_role: 'presentation',
    time_availability: 2,
    target_grade: 'A+',
    ppt_skill: 3, pres_skill: 2, res_skill: 1, relevance: 2, doc_skill: 2, comm_style: 3, conflict_style: 3
  },
  {
    user_id: 'u2',
    department: '경영학과',
    student_id_prefix: '20',
    gender: 'M',
    preferred_role: 'leader',
    avoided_role: 'ppt',
    time_availability: 3,
    target_grade: 'A+',
    ppt_skill: 2, pres_skill: 3, res_skill: 3, relevance: 3, doc_skill: 3, comm_style: 1, conflict_style: 1
  },
  {
    user_id: 'u3',
    department: '컴퓨터공학과',
    student_id_prefix: '21',
    gender: 'M',
    preferred_role: 'presentation',
    avoided_role: 'leader',
    time_availability: 2,
    target_grade: 'Pass',
    ppt_skill: 2, pres_skill: 3, res_skill: 2, relevance: 2, doc_skill: 2, comm_style: 1, conflict_style: 2
  },
  {
    user_id: 'u4',
    department: '화학공학과',
    student_id_prefix: '23',
    gender: 'W',
    preferred_role: 'research',
    avoided_role: 'leader',
    time_availability: 1, // Busy!
    target_grade: 'Pass',
    ppt_skill: 1, pres_skill: 1, res_skill: 3, relevance: 2, doc_skill: 3, comm_style: 2, conflict_style: 2
  }
];

console.log('--- TEST 1: Standard Normal Matching (Size 4) ---');
let res1 = performMatching(members1, users1);
console.log(JSON.stringify(res1, null, 2));

// Test Case 2: Deadlock Room Size 4 (Everyone avoids Leader and wants Pass, nobody wants presentation)
const users2 = [
  { user_id: 'u1', nickname: '조원A' },
  { user_id: 'u2', nickname: '조원B' },
  { user_id: 'u3', nickname: '조원C' },
  { user_id: 'u4', nickname: '조원D' }
];

const members2 = [
  {
    user_id: 'u1',
    department: '행정학과',
    student_id_prefix: '22',
    gender: 'M',
    preferred_role: 'research',
    avoided_role: 'leader',
    time_availability: 2,
    target_grade: 'Pass',
    ppt_skill: 2, pres_skill: 2, res_skill: 2, relevance: 2, doc_skill: 2, comm_style: 2, conflict_style: 2
  },
  {
    user_id: 'u2',
    department: '영어영문학과',
    student_id_prefix: '23',
    gender: 'W',
    preferred_role: 'research',
    avoided_role: 'leader',
    time_availability: 2,
    target_grade: 'Pass',
    ppt_skill: 2, pres_skill: 2, res_skill: 2, relevance: 2, doc_skill: 2, comm_style: 2, conflict_style: 2
  },
  {
    user_id: 'u3',
    department: '경영학과',
    student_id_prefix: '22',
    gender: 'W',
    preferred_role: 'research',
    avoided_role: 'presentation',
    time_availability: 2,
    target_grade: 'Pass',
    ppt_skill: 2, pres_skill: 2, res_skill: 2, relevance: 2, doc_skill: 2, comm_style: 2, conflict_style: 2
  },
  {
    user_id: 'u4',
    department: '사회복지학과',
    student_id_prefix: '23',
    gender: 'M',
    preferred_role: 'research',
    avoided_role: 'ppt',
    time_availability: 2,
    target_grade: 'Pass',
    ppt_skill: 2, pres_skill: 2, res_skill: 2, relevance: 2, doc_skill: 2, comm_style: 2, conflict_style: 2
  }
];

console.log('\n--- TEST 2: Deadlock Scenario (Intervention Expected) ---');
let res2 = performMatching(members2, users2);
console.log(JSON.stringify(res2, null, 2));
const hasIntervention = res2.some(r => r.intervened);
console.log(`System Balancer Intervention Triggered: ${hasIntervention}`);
