import { CONFIG } from './config.js';
import { escapeHtml } from './utils.js';

export const CareerMatcher = {
  
  // Database of roles with matching criteria, skill requirements, and project ideas
  ROLES_CATALOG: [
    {
      id: 'frontend-intern',
      title: 'Frontend Developer Intern',
      type: 'Internship',
      category: 'Frontend & Web',
      primaryLangs: ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'Vue', 'Svelte'],
      keywords: ['react', 'next.js', 'vue', 'tailwind', 'redux', 'vite', 'webpack', 'frontend', 'ui', 'css', 'sass'],
      baseMatch: 75,
      skillsPossessed: ['HTML5 & CSS3', 'JavaScript / ES6+', 'Modern UI Design'],
      skillsToLearn: ['TypeScript', 'Tailwind CSS', 'Testing (Jest/Cypress)', 'Web Performance'],
      description: 'Build interactive, responsive web interfaces, collaborate with design teams, and optimize client-side performance.',
      projectIdeas: [
        'Interactive SaaS Dashboard with dark mode, live charts, and component library',
        'Real-time Collaborative Whiteboard or Canvas tool using WebSockets'
      ],
      searchKeywords: 'Frontend Developer Internship'
    },
    {
      id: 'junior-frontend-dev',
      title: 'Junior Frontend Engineer',
      type: 'Junior / Entry-Level',
      category: 'Frontend & Web',
      primaryLangs: ['TypeScript', 'JavaScript', 'HTML', 'CSS'],
      keywords: ['react', 'next.js', 'typescript', 'tailwind', 'graphql', 'zustand'],
      baseMatch: 70,
      skillsPossessed: ['JavaScript / TypeScript', 'Component Architecture', 'State Management'],
      skillsToLearn: ['Next.js / SSR', 'GraphQL / REST Integration', 'CI/CD & Accessibility (a11y)'],
      description: 'Develop production-grade user-facing features, maintain clean component hierarchies, and integrate REST/GraphQL APIs.',
      projectIdeas: [
        'Full-featured E-Commerce Store with cart, Stripe checkout, and SSR with Next.js',
        'Developer Tooling Web App with markdown rendering and GitHub OAuth'
      ],
      searchKeywords: 'Junior Frontend Engineer'
    },
    {
      id: 'backend-python-intern',
      title: 'Backend Engineering Intern (Python)',
      type: 'Internship',
      category: 'Backend & APIs',
      primaryLangs: ['Python'],
      keywords: ['django', 'fastapi', 'flask', 'sqlalchemy', 'postgresql', 'api', 'backend', 'redis'],
      baseMatch: 80,
      skillsPossessed: ['Python 3', 'REST API Design', 'Data Modeling'],
      skillsToLearn: ['FastAPI / AsyncIO', 'PostgreSQL & ORM', 'Docker & Containerization', 'Redis Caching'],
      description: 'Design and deploy scalable RESTful APIs, manage databases, and write efficient backend services.',
      projectIdeas: [
        'High-performance REST API with FastAPI, JWT authentication, and rate limiting',
        'Task Queue & Background Worker service with Celery and Redis'
      ],
      searchKeywords: 'Python Backend Developer Internship'
    },
    {
      id: 'fullstack-intern',
      title: 'Full-Stack Developer Intern',
      type: 'Internship',
      category: 'Full-Stack',
      primaryLangs: ['JavaScript', 'TypeScript', 'Python', 'PHP', 'Ruby', 'Java'],
      keywords: ['node.js', 'express', 'react', 'next.js', 'django', 'mongodb', 'postgresql', 'fullstack'],
      baseMatch: 78,
      skillsPossessed: ['Client & Server Architecture', 'Database Integration', 'API Development'],
      skillsToLearn: ['Docker Containers', 'Cloud Deployment (AWS/Vercel)', 'Automated Unit/E2E Testing'],
      description: 'Work across both the client-side interface and server-side business logic, shipping complete end-to-end features.',
      projectIdeas: [
        'Full-stack Project Management Tool with drag-and-drop Kanban and real-time updates',
        'Multi-tenant Blogging Platform with markdown editor and image storage'
      ],
      searchKeywords: 'Full Stack Developer Internship'
    },
    {
      id: 'junior-fullstack-dev',
      title: 'Junior Full-Stack Engineer',
      type: 'Junior / Entry-Level',
      category: 'Full-Stack',
      primaryLangs: ['TypeScript', 'JavaScript', 'Python', 'Go'],
      keywords: ['next.js', 'react', 'node.js', 'postgresql', 'prisma', 'docker'],
      baseMatch: 72,
      skillsPossessed: ['Full-Stack TypeScript / Node', 'SQL Databases', 'Authentication & Security'],
      skillsToLearn: ['Microservices / Monorepo architecture', 'Docker & Kubernetes', 'System Design Basics'],
      description: 'Ship scalable full-stack applications with robust backend services, databases, and polished frontends.',
      projectIdeas: [
        'AI-Powered Code Assistant Web App with OAuth, streaming responses, and billing',
        'Real-time Analytics Engine with dashboard and high-throughput ingestion endpoint'
      ],
      searchKeywords: 'Junior Full Stack Engineer'
    },
    {
      id: 'ai-ml-intern',
      title: 'AI / Machine Learning Intern',
      type: 'Internship',
      category: 'AI & Data Science',
      primaryLangs: ['Python', 'R', 'C++', 'Julia'],
      keywords: ['tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy', 'opencv', 'nlp', 'llm', 'machine learning', 'deep learning'],
      baseMatch: 82,
      skillsPossessed: ['Python Scientific Stack (NumPy/Pandas)', 'Model Training & Evaluation', 'Data Cleaning'],
      skillsToLearn: ['PyTorch / HuggingFace Transformers', 'Vector Databases (Chroma/Pinecone)', 'MLOps & Model Deployment'],
      description: 'Train, evaluate, and fine-tune machine learning and NLP models, clean complex datasets, and build intelligent features.',
      projectIdeas: [
        'RAG (Retrieval-Augmented Generation) Document Search engine using LangChain and Vector DB',
        'Computer Vision Object Detection / Image Classifier deployed as a web service'
      ],
      searchKeywords: 'Machine Learning Intern'
    },
    {
      id: 'data-analytics-intern',
      title: 'Data Analyst / Data Engineer Intern',
      type: 'Internship',
      category: 'AI & Data Science',
      primaryLangs: ['Python', 'R', 'SQL', 'Julia'],
      keywords: ['pandas', 'numpy', 'matplotlib', 'seaborn', 'sql', 'tableau', 'spark', 'etl'],
      baseMatch: 76,
      skillsPossessed: ['Data Wrangling & Analysis', 'SQL Querying', 'Data Visualization'],
      skillsToLearn: ['ETL Pipeline Orchestration', 'dbt / Apache Spark', 'Cloud Data Warehouses (BigQuery/Snowflake)'],
      description: 'Extract insights from complex datasets, build automated ETL data pipelines, and design business intelligence dashboards.',
      projectIdeas: [
        'Automated GitHub Trends ETL Pipeline and interactive visualization dashboard',
        'Predictive Customer Churn / Financial Analysis with interactive Streamlit app'
      ],
      searchKeywords: 'Data Analyst Internship'
    },
    {
      id: 'mobile-dev-intern',
      title: 'Mobile App Developer Intern (iOS/Android/Flutter)',
      type: 'Internship',
      category: 'Mobile Development',
      primaryLangs: ['Dart', 'Kotlin', 'Swift', 'Java', 'JavaScript', 'TypeScript'],
      keywords: ['flutter', 'react native', 'android', 'ios', 'swiftui', 'jetpack compose'],
      baseMatch: 80,
      skillsPossessed: ['Mobile UI Development', 'State Management', 'REST API Consumption'],
      skillsToLearn: ['Offline-First Storage / SQLite', 'Native Platform APIs & Notifications', 'App Store / Play Store Deployment'],
      description: 'Build fluid, cross-platform or native mobile applications with responsive layouts and offline sync.',
      projectIdeas: [
        'Habit Tracker & Productivity Mobile App with local SQLite and push notifications',
        'Social Fitness / Workout Tracking App with camera integration and cloud backup'
      ],
      searchKeywords: 'Mobile App Developer Internship'
    },
    {
      id: 'backend-go-rust-intern',
      title: 'Systems & Backend Intern (Go / Rust / C++)',
      type: 'Internship',
      category: 'Systems & Cloud',
      primaryLangs: ['Go', 'Rust', 'C++', 'C'],
      keywords: ['goroutines', 'concurrency', 'grpc', 'tokio', 'memory management', 'systems', 'microservices'],
      baseMatch: 84,
      skillsPossessed: ['Strong Type Systems', 'Concurrency & Multithreading', 'Memory Efficiency'],
      skillsToLearn: ['gRPC & Protocol Buffers', 'High-throughput Networking', 'Distributed Systems Patterns'],
      description: 'Build blazing-fast, low-latency microservices, CLI tools, and network daemons with strict memory and CPU budgets.',
      projectIdeas: [
        'Custom In-Memory Key-Value Database with custom wire protocol (like Redis)',
        'High-Throughput Reverse Proxy / Load Balancer with health checks'
      ],
      searchKeywords: 'Go Backend Developer Internship'
    },
    {
      id: 'devops-cloud-intern',
      title: 'DevOps & Cloud Infrastructure Intern',
      type: 'Internship',
      category: 'Systems & Cloud',
      primaryLangs: ['Shell', 'Python', 'Go', 'HCL', 'Dockerfile'],
      keywords: ['docker', 'kubernetes', 'aws', 'terraform', 'ci/cd', 'github actions', 'linux', 'bash'],
      baseMatch: 75,
      skillsPossessed: ['Linux & Bash Scripting', 'Git & GitHub Actions', 'Containerization (Docker)'],
      skillsToLearn: ['Kubernetes Orchestration', 'Terraform (IaC)', 'Prometheus & Grafana Monitoring'],
      description: 'Automate deployment pipelines, orchestrate containerized workloads, and ensure high availability and security of cloud infrastructure.',
      projectIdeas: [
        'Automated Multi-Stage CI/CD Pipeline deploying microservices to Kubernetes',
        'Infrastructure as Code (Terraform) blueprint provisioning complete AWS VPC with monitoring'
      ],
      searchKeywords: 'DevOps Cloud Intern'
    },
    {
      id: 'java-backend-intern',
      title: 'Java / Enterprise Backend Intern',
      type: 'Internship',
      category: 'Backend & APIs',
      primaryLangs: ['Java', 'Kotlin', 'C#'],
      keywords: ['spring boot', 'spring', 'hibernate', 'maven', 'gradle', '.net', 'asp.net'],
      baseMatch: 78,
      skillsPossessed: ['Object-Oriented Design', 'Java / Spring Framework', 'Relational Databases'],
      skillsToLearn: ['Spring Security & JWT', 'Microservices with Spring Cloud', 'Kafka Message Queues'],
      description: 'Build enterprise-grade REST APIs, maintain business logic, and handle large-scale database operations.',
      projectIdeas: [
        'Banking / Payment Gateway Simulation API with Spring Boot and PostgreSQL',
        'Event-driven Order Processing System with Apache Kafka and Spring Boot'
      ],
      searchKeywords: 'Java Spring Boot Internship'
    },
    {
      id: 'open-source-fellow',
      title: 'Open Source Software Engineering Fellow',
      type: 'Fellowship / Remote',
      category: 'Open Source',
      primaryLangs: ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'C++', 'Java'],
      keywords: ['git', 'github', 'open source', 'documentation', 'testing'],
      baseMatch: 70,
      skillsPossessed: ['Git Version Control', 'Code Review & Collaboration', 'Public Documentation'],
      skillsToLearn: ['Large Codebase Navigation', 'Upstream Patching & RFCs', 'Community Issue Triage'],
      description: 'Contribute to global open-source ecosystems, resolve community bug reports, and architect modular software libraries.',
      projectIdeas: [
        'Published Open-Source NPM/PyPI Utility Library with 100% test coverage and automated releases',
        'Contribution record with 3+ merged Pull Requests to major open-source repositories'
      ],
      searchKeywords: 'Open Source Software Fellowship'
    }
  ],

  // Main career analysis engine
  analyzeCareer(profileData) {
    const { profile, repos, langStats, commits, streaks, techStack = [] } = profileData;
    
    // 1. Identify primary and secondary languages
    const topLangs = (langStats || []).map(l => l.name);
    const topLangNamesLower = topLangs.map(l => l.toLowerCase());
    const topLangPcts = {};
    (langStats || []).forEach(l => { topLangPcts[l.name] = l.pct; });

    // 2. Aggregate text from repos for keyword scanning
    const repoCorpus = (repos || []).map(r => `${r.name} ${r.description || ''}`).join(' ').toLowerCase();
    const techStackLower = (techStack || []).map(t => t.toLowerCase());

    // 3. Score every role from database
    const matchedRoles = this.ROLES_CATALOG.map(role => {
      let score = 0;
      let matchedReasons = [];

      // Check primary languages overlap
      let langWeight = 0;
      role.primaryLangs.forEach(lang => {
        if (topLangs.includes(lang)) {
          const pct = topLangPcts[lang] || 0;
          langWeight += (pct / 100) * 45;
          matchedReasons.push(`Strong code footprint in **${lang}** (${pct.toFixed(0)}%)`);
        }
      });
      score += Math.min(langWeight, 50);

      // Check keywords in repo descriptions and tech stack
      let keywordHits = 0;
      role.keywords.forEach(kw => {
        if (repoCorpus.includes(kw) || techStackLower.includes(kw)) {
          keywordHits++;
        }
      });
      const kwScore = Math.min(keywordHits * 7, 30);
      score += kwScore;
      if (keywordHits > 0) {
        matchedReasons.push(`Detected related repositories and tooling matching **${role.category}**`);
      }

      // Commit activity & repo volume boost
      const repoCount = repos ? repos.length : 0;
      const commitCount = commits ? commits.length : 0;
      if (repoCount >= 5) score += 5;
      if (repoCount >= 15) score += 5;
      if (commitCount >= 30) score += 5;
      if (streaks && streaks.totalActive >= 10) score += 5;

      // Ensure reasonable baseline if language matches
      const hasLangMatch = role.primaryLangs.some(l => topLangs.includes(l));
      if (hasLangMatch && score < 60) {
        score = 60 + Math.floor(Math.random() * 15);
      } else if (!hasLangMatch) {
        score = Math.max(25, Math.min(score, 55));
      }

      const finalMatchPct = Math.min(Math.round(score), 98);

      return {
        ...role,
        matchPct: finalMatchPct,
        reasons: matchedReasons.length > 0 ? matchedReasons : [`Compatible with your polyglot developer foundations.`],
        links: {
          linkedin: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role.searchKeywords)}`,
          indeed: `https://www.indeed.com/jobs?q=${encodeURIComponent(role.searchKeywords)}`,
          wellfound: `https://wellfound.com/jobs?query=${encodeURIComponent(role.searchKeywords)}`,
          google: `https://www.google.com/search?q=${encodeURIComponent(role.searchKeywords + ' jobs')}`
        }
      };
    });

    // Sort by match percentage descending
    matchedRoles.sort((a, b) => b.matchPct - a.matchPct);

    // 4. Determine Developer Archetype & Readiness Level
    const archetype = this._calculateArchetype(topLangs, techStackLower, repos);
    const readiness = this._calculateReadiness(profile, repos, commits, streaks, (langStats || []).length);

    return {
      archetype,
      readiness,
      topLanguages: topLangs.slice(0, 4),
      matchedRoles,
      topMatchedRole: matchedRoles[0],
      totalRolesAnalyzed: this.ROLES_CATALOG.length
    };
  },

  _calculateArchetype(topLangs, techStack, repos) {
    const langs = topLangs.map(l => l.toLowerCase());
    
    if (langs.includes('python') && (langs.includes('r') || techStack.includes('tensorflow') || techStack.includes('pytorch') || techStack.includes('pandas'))) {
      return {
        title: 'AI & Data Science Specialist',
        tagline: 'Excels at building intelligent algorithms, analyzing large datasets, and deploying machine learning models.',
        badge: '🤖 AI / ML Domain',
        color: '#9f7aea'
      };
    }
    if ((langs.includes('javascript') || langs.includes('typescript')) && (langs.includes('html') || techStack.includes('react') || techStack.includes('vue') || techStack.includes('next.js'))) {
      if (langs.includes('python') || langs.includes('go') || langs.includes('java') || techStack.includes('node.js')) {
        return {
          title: 'Full-Stack Web Architect',
          tagline: 'Versatile across modern frontend user experiences and scalable server-side REST APIs.',
          badge: '⚡ Full-Stack Domain',
          color: '#5b6af0'
        };
      }
      return {
        title: 'Frontend UI/UX Specialist',
        tagline: 'Focuses on craft, fluid user interactions, component architectures, and responsive design systems.',
        badge: '🎨 Frontend Domain',
        color: '#38c97a'
      };
    }
    if (langs.includes('go') || langs.includes('rust') || langs.includes('c++') || langs.includes('c')) {
      return {
        title: 'Systems & Performance Engineer',
        tagline: 'Specializes in high-throughput backends, memory-safe code, and low-latency infrastructure.',
        badge: '⚙️ Systems Domain',
        color: '#f79824'
      };
    }
    if (langs.includes('dart') || langs.includes('kotlin') || langs.includes('swift')) {
      return {
        title: 'Mobile Application Creator',
        tagline: 'Passionate about mobile ecosystems, touch-first ergonomics, and cross-platform native apps.',
        badge: '📱 Mobile Domain',
        color: '#ed64a6'
      };
    }
    if (langs.length >= 3) {
      return {
        title: 'Polyglot Software Engineer',
        tagline: 'Adaptable problem-solver proficient across multiple programming paradigms and runtimes.',
        badge: '🌐 Polyglot Domain',
        color: '#38b2ac'
      };
    }

    return {
      title: 'Software Engineering Explorer',
      tagline: 'Building versatile software foundations and actively expanding repository portfolio.',
      badge: '🚀 Core Engineering',
      color: '#5b6af0'
    };
  },

  _calculateReadiness(profile, repos, commits, streaks, langCount) {
    const repoCount = (repos || []).length;
    const commitCount = (commits || []).length;
    const totalStars = (repos || []).reduce((acc, r) => acc + (r.stars || 0), 0);
    const activeDays = streaks ? streaks.totalActive : 0;

    let score = 40;
    if (repoCount >= 3) score += 10;
    if (repoCount >= 8) score += 10;
    if (commitCount >= 20) score += 10;
    if (commitCount >= 60) score += 10;
    if (activeDays >= 10) score += 10;
    if (totalStars >= 5) score += 5;
    if (langCount >= 2) score += 5;

    score = Math.min(score, 100);

    let level = 'Internship Ready';
    let badgeClass = 'readiness-intern';
    let desc = 'You have active code projects and core language foundations ready to secure competitive software internships.';

    if (score >= 85) {
      level = 'Junior / Associate Engineer Ready';
      badgeClass = 'readiness-junior';
      desc = 'Your GitHub portfolio demonstrates substantial project variety, strong version control cadence, and production readiness.';
    } else if (score >= 65) {
      level = 'Strong Internship & Project Candidate';
      badgeClass = 'readiness-strong';
      desc = 'Solid repository base and consistent commits. Adding 1-2 featured full-stack projects will elevate your recruiter callback rate.';
    }

    return { score, level, badgeClass, desc };
  },

  // Generates an AI Job Application & Interview Prep Strategy
  async generateAiCareerStrategy(role, profileData) {
    const apiKey = CONFIG.GEMINI_API_KEY;
    const { profile, langStats, repos } = profileData;
    const username = profile?.login || 'Developer';
    const topLangs = (langStats || []).slice(0, 3).map(l => l.name).join(', ');
    const topRepos = (repos || []).slice(0, 3).map(r => r.name).join(', ');

    if (!apiKey || !apiKey.trim()) {
      return this._fallbackStrategy(role, username, topLangs, topRepos);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const prompt = `You are an elite Tech Career Coach and Hiring Manager.
Provide a hyper-tailored job application and interview preparation blueprint for developer @${username} targeting the role: "${role.title}".
Their top languages are: ${topLangs}.
Their top repositories are: ${topRepos}.

Return a JSON object with this EXACT structure (no markdown fences, just pure JSON):
{
  "elevatorPitch": "A punchy, 2-sentence introduction for recruiters highlighting their exact GitHub experience.",
  "resumeBulletPoints": [
    "Action-driven resume bullet point incorporating one of their repositories",
    "Second strong bullet point emphasizing technical problem-solving and scalability"
  ],
  "interviewQuestions": [
    { "q": "Technical interview question tailored to this role and their tech stack", "tip": "How they should answer using their GitHub projects as proof" },
    { "q": "Second behavioral or system question", "tip": "Strategic answer tip" }
  ],
  "breakthroughAction": "The single most impactful project or skill addition they should make this week."
}`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
        })
      });

      if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
      return JSON.parse(clean);
    } catch (err) {
      console.warn('Using fallback career strategy:', err);
      return this._fallbackStrategy(role, username, topLangs, topRepos);
    }
  },

  _fallbackStrategy(role, username, topLangs, topRepos) {
    return {
      elevatorPitch: `Passionate developer proficient in ${topLangs || 'modern software technologies'}, with demonstrated practical experience building public projects such as ${topRepos || 'featured GitHub repositories'}. Ready to deliver immediate impact as a ${role.title}.`,
      resumeBulletPoints: [
        `Architected and deployed open-source projects using ${topLangs || 'modern software stack'}, implementing clean modular architecture and responsive state management.`,
        `Maintained active Git version control workflows, implementing RESTful API integrations and optimized algorithms across ${topRepos || 'core repositories'}.`
      ],
      interviewQuestions: [
        {
          q: `How have you structured your projects in ${topLangs.split(',')[0] || 'your primary language'} to ensure clean maintainability?`,
          tip: `Reference one of your top repositories (${topRepos.split(',')[0] || 'your main repo'}), explain the folder structure, component/service separation, and how you handled error states.`
        },
        {
          q: `Describe a technical hurdle you encountered while building your GitHub projects and how you debugged it.`,
          tip: `Use the STAR method (Situation, Task, Action, Result) focusing on your debugging strategy and metrics improvement.`
        }
      ],
      breakthroughAction: `Build and deploy the recommended portfolio project: "${role.projectIdeas[0]}" with live demo link and comprehensive README to stand out immediately to recruiters.`
    };
  }
};

