/**
 * Daejin University Teamplay Balancer Role Matching Algorithm
 */

// Helper to parse cohort year from student_id_prefix
function parseCohort(prefix) {
  if (!prefix) return null;
  const numString = String(prefix).replace(/[^0-9]/g, '');
  if (!numString) return null;
  // If it's a 4 digit year e.g. 2021, get the last 2 digits
  if (numString.length === 4) {
    return parseInt(numString.substring(2, 4), 10);
  }
  // Otherwise get the first 2 digits
  const val = parseInt(numString.substring(0, 2), 10);
  if (val >= 10 && val <= 30) {
    return val;
  }
  return null;
}

// Helper to check if a department is design-related (Rule 1)
function isDesignRelated(dept) {
  if (!dept) return false;
  const normalized = dept.toLowerCase().replace(/\s+/g, '');
  const designKeywords = [
    '시각디자인', '디자인', '시디', '미술', '예술', '조형',
    'design', 'art', 'multimedia', '멀티미디어'
  ];
  return designKeywords.some(keyword => normalized.includes(keyword));
}

// Roles definition based on room size N
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
  roles.push({
    id: 'leader',
    type: 'leader',
    label: '조장 (자료취합/PM)',
    description: '조별과제 일정 조율, 팀원 간 업무 진행현황 확인 및 최종 자료 취합/검토를 총괄합니다.'
  });

  if (N === 4) {
    roles.push({ id: 'ppt', type: 'ppt', label: 'PPT 제작', description: '발표용 PPT 템플릿 디자인과 슬라이드 구성 및 시각화 작업을 주도합니다.' });
    roles.push({ id: 'presentation', type: 'presentation', label: '발표 담당', description: '최종 PPT를 기반으로 발표 대본 작성, 리허설 및 질의응답 대응을 담당합니다.' });
    roles.push({ id: 'research', type: 'research', label: '자료조사', description: '과제 주제에 맞는 핵심 정보 검색, 논문 및 통계자료 수집 및 요약본을 제공합니다.' });
  } else {
    // N >= 5
    let pptCount = 1;
    let presCount = 1;
    let resCount = 1;
    
    let remaining = N - 4;
    while (remaining > 0) {
      if (remaining > 0) { resCount++; remaining--; }
      if (remaining > 0) { pptCount++; remaining--; }
      if (remaining > 0) { presCount++; remaining--; }
    }

    // Add PPT roles
    for (let i = 1; i <= pptCount; i++) {
      roles.push({
        id: `ppt_${i}`,
        type: 'ppt',
        label: `PPT 제작 ${pptCount > 1 ? i + '파트' : ''}`,
        description: `발표용 PPT 제작 및 시각화 파트 ${i}를 담당하여 협업합니다.`
      });
    }

    // Add Presentation roles
    for (let i = 1; i <= presCount; i++) {
      roles.push({
        id: `presentation_${i}`,
        type: 'presentation',
        label: `발표 담당 ${presCount > 1 ? i + '파트' : ''}`,
        description: `발표 슬라이드 대본 작성 및 스피치 파트 ${i} 발표를 조율합니다.`
      });
    }

    // Add Research roles
    for (let i = 1; i <= resCount; i++) {
      roles.push({
        id: `research_${i}`,
        type: 'research',
        label: `자료조사 ${resCount > 1 ? i + '파트' : ''}`,
        description: `과제 핵심 주제 조사 및 상세 논문/데이터 정리 파트 ${i}를 분석 및 공유합니다.`
      });
    }
  }

  return roles;
}

/**
 * Perform matching algorithm on a room's members
 * @param {Array} members List of member records from database
 * @param {Array} users List of corresponding user records (to get nicknames)
 * @returns {Array} List of assignments with role details
 */
function performMatching(members, users) {
  const N = members.length;
  const roles = getRolesForSize(N);
  
  // Pre-calculate design departments & cohorts
  const memberDetails = members.map(m => {
    const user = users.find(u => u.user_id === m.user_id) || {};
    return {
      ...m,
      nickname: user.nickname || '익명 조원',
      cohort: parseCohort(m.student_id_prefix),
      isDesign: isDesignRelated(m.department)
    };
  });

  // Find min cohort (meaning oldest student, e.g. 19 is older than 23)
  let minCohort = null;
  memberDetails.forEach(m => {
    if (m.cohort !== null) {
      if (minCohort === null || m.cohort < minCohort) {
        minCohort = m.cohort;
      }
    }
  });

  // Helper to calculate score for a member assigning to a role type
  function getScore(m, roleType) {
    let score = 0;

    // Rule 1: Design department & prefers PPT -> Force Match (give huge boost)
    if (roleType === 'ppt' && m.isDesign && m.preferred_role === 'ppt') {
      score += 100.0;
    }

    // Rule 2: Leader Selection (Commitment + Seniority)
    if (roleType === 'leader') {
      // Commitment: A+ target grade
      if (m.target_grade === 'A+') {
        score += 5.0;
      }
      
      // Seniority tie-breaker: if they are the most senior in the group
      if (m.cohort !== null && m.cohort === minCohort) {
        score += 3.0;
      }
    }

    // Rule 3: Time availability workload balancing
    // availability: 1 = busy, 2 = normal, 3 = very free
    if (m.time_availability === 1) {
      // Exclude or highly penalize from long tasks: leader, ppt
      if (roleType === 'leader' || roleType === 'ppt') {
        score -= 20.0;
      }
      // Prefer short tasks: research, presentation
      if (roleType === 'research' || roleType === 'presentation') {
        score += 4.0;
      }
    } else if (m.time_availability === 3) {
      // Very free: prefer major roles
      if (roleType === 'leader' || roleType === 'ppt') {
        score += 4.0;
      }
    }

    // Detailed Skill-Based & Domain Relevance Weighting
    if (roleType === 'ppt') {
      if (m.ppt_skill === 3) score += 4.0;
      if (m.ppt_skill === 1) score -= 10.0;
      if (m.comm_style === 3) score += 2.5; // quiet workers fit PPT/execution well
      if (m.conflict_style === 3) score += 1.5; // compliers fit practical work
    }
    if (roleType === 'presentation') {
      if (m.pres_skill === 3) score += 4.0;
      if (m.pres_skill === 1) score -= 15.0; // avoid stage fright
      if (m.comm_style === 1) score += 2.0; // proactive communicators fit presentation
      if (m.comm_style === 2) score += 1.0;
      if (m.conflict_style === 2) score += 2.0; // logical persuaders fit Q&A / speaking
    }
    if (roleType === 'research') {
      if (m.res_skill === 3) score += 4.0;
      if (m.res_skill === 1) score -= 3.0;
      if (m.doc_skill === 3) score += 3.0; // high report writing skill
      if (m.doc_skill === 1) score -= 3.0;
      if (m.comm_style === 2) score += 2.0;
      if (m.comm_style === 3) score += 1.5;
      if (m.conflict_style === 2) score += 2.0;
    }
    if (roleType === 'leader') {
      if (m.relevance === 3) score += 3.0; // domain knowledge
      if (m.ppt_skill === 3 || m.res_skill === 3) score += 1.5; // general skill boost
      if (m.doc_skill === 3) score += 2.0; // high synthesis/writing skills
      if (m.doc_skill === 1) score -= 2.0;
      if (m.comm_style === 1) score += 5.0; // meetings organizer gets huge leader preference
      if (m.comm_style === 3) score -= 3.0; // quiet worker penalization for leader
      if (m.conflict_style === 1) score += 4.0; // mediator style is perfect for leader
    }

    // Preference matching
    if (m.preferred_role === roleType) {
      score += 3.0;
    }
    if (m.avoided_role === roleType) {
      score -= 8.0;
    }
    if (m.confirmed_role === roleType) {
      score += 40.0;
    }

    // Add random salt (Rule 4) to ensure unique, fair tie breaks
    score += Math.random() * 0.1;

    return score;
  }

  // Generate all candidate pairs and sort by score descending
  const candidates = [];
  for (let mIdx = 0; mIdx < N; mIdx++) {
    const member = memberDetails[mIdx];
    for (let rIdx = 0; rIdx < N; rIdx++) {
      const role = roles[rIdx];
      const score = getScore(member, role.type);
      candidates.push({
        mIdx,
        rIdx,
        score,
        member,
        role
      });
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Keep track of assignments
  const assignedMembers = new Set();
  const assignedRoles = new Set();
  const assignments = [];

  // Greedy matching
  for (const cand of candidates) {
    if (!assignedMembers.has(cand.mIdx) && !assignedRoles.has(cand.rIdx)) {
      assignedMembers.add(cand.mIdx);
      assignedRoles.add(cand.rIdx);

      // Check if this assignment matches the user's avoided role (intervened flag)
      const intervened = cand.member.avoided_role === cand.role.type;

      assignments.push({
        user_id: cand.member.user_id,
        nickname: cand.member.nickname,
        assigned_role: cand.role.label,
        assigned_duty_description: cand.role.description,
        intervened: intervened
      });
    }
  }

  return assignments;
}

module.exports = {
  getRolesForSize,
  performMatching,
  parseCohort,
  isDesignRelated
};
