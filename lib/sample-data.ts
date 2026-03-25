export interface SubQuestion {
  question: string;
  priority: number;
  answered: boolean;
  searchQueries: string[];
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
}

export interface KGEntity {
  name: string;
  entityType: string;
  description: string;
}

export interface KGRelation {
  source: string;
  target: string;
  relation: string;
}

export interface Citation {
  index: number;
  url: string;
  title: string;
  snippet?: string;
}

export interface QualityScores {
  comprehensiveness: number;
  insight: number;
  instruction_following: number;
  readability: number;
}

export interface ResearchResult {
  query: string;
  language: string;
  subQuestions: SubQuestion[];
  searchResults: SearchResult[];
  kgEntities: KGEntity[];
  kgRelations: KGRelation[];
  article: string;
  citations: Citation[];
  qualityScores: QualityScores;
  searchIterations: number;
  revisions: number;
}

export const sampleResearchResult: ResearchResult = {
  query: "What are the latest advances in quantum computing and their potential impact on cryptography?",
  language: "en",
  subQuestions: [
    {
      question: "What are the current state-of-the-art quantum computing architectures?",
      priority: 1,
      answered: true,
      searchQueries: ["quantum computing architectures 2024", "superconducting qubits vs trapped ions"],
    },
    {
      question: "How do quantum computers threaten current cryptographic systems?",
      priority: 1,
      answered: true,
      searchQueries: ["Shor's algorithm RSA threat", "quantum computing cryptography vulnerability"],
    },
    {
      question: "What is post-quantum cryptography and what are the leading candidates?",
      priority: 2,
      answered: true,
      searchQueries: ["NIST post-quantum cryptography standards", "lattice-based cryptography"],
    },
    {
      question: "What is the current timeline for quantum computers to break encryption?",
      priority: 2,
      answered: true,
      searchQueries: ["quantum computing timeline prediction", "cryptographically relevant quantum computer"],
    },
    {
      question: "How are organizations preparing for the quantum threat?",
      priority: 3,
      answered: true,
      searchQueries: ["quantum-safe migration strategies", "enterprise quantum readiness"],
    },
  ],
  searchResults: [
    {
      url: "https://www.nature.com/articles/quantum-computing-2024",
      title: "Quantum Computing Reaches New Milestone with 1000+ Qubit Processors",
      snippet: "Recent advances in quantum error correction have enabled processors with over 1000 logical qubits...",
      relevanceScore: 9.2,
    },
    {
      url: "https://arxiv.org/abs/2024.quantum-crypto",
      title: "Post-Quantum Cryptography: A Comprehensive Survey",
      snippet: "This survey examines the current landscape of post-quantum cryptographic algorithms...",
      relevanceScore: 9.0,
    },
    {
      url: "https://www.nist.gov/pqc-standards",
      title: "NIST Announces First Post-Quantum Cryptography Standards",
      snippet: "The National Institute of Standards and Technology has finalized its selection of quantum-resistant algorithms...",
      relevanceScore: 8.8,
    },
    {
      url: "https://www.ibm.com/quantum/roadmap",
      title: "IBM Quantum Development Roadmap 2024-2030",
      snippet: "IBM unveils ambitious plans to achieve quantum advantage in practical applications by 2028...",
      relevanceScore: 8.5,
    },
    {
      url: "https://security.googleblog.com/quantum-threat",
      title: "Preparing for the Quantum Computing Era: A Security Perspective",
      snippet: "Google's security team outlines strategies for transitioning to quantum-safe cryptography...",
      relevanceScore: 8.3,
    },
  ],
  kgEntities: [
    { name: "Quantum Computing", entityType: "Technology", description: "Computation using quantum-mechanical phenomena" },
    { name: "Post-Quantum Cryptography", entityType: "Field", description: "Cryptographic algorithms resistant to quantum attacks" },
    { name: "Shor's Algorithm", entityType: "Algorithm", description: "Quantum algorithm for integer factorization" },
    { name: "NIST", entityType: "Organization", description: "National Institute of Standards and Technology" },
    { name: "Lattice-Based Cryptography", entityType: "Method", description: "Cryptographic constructions based on lattice problems" },
    { name: "RSA", entityType: "Algorithm", description: "Public-key cryptosystem widely used for secure data transmission" },
    { name: "CRYSTALS-Kyber", entityType: "Algorithm", description: "NIST-selected post-quantum key encapsulation mechanism" },
    { name: "Superconducting Qubits", entityType: "Technology", description: "Quantum computing approach using superconducting circuits" },
  ],
  kgRelations: [
    { source: "Shor's Algorithm", target: "RSA", relation: "threatens" },
    { source: "NIST", target: "CRYSTALS-Kyber", relation: "standardized" },
    { source: "Lattice-Based Cryptography", target: "Post-Quantum Cryptography", relation: "is_type_of" },
    { source: "Quantum Computing", target: "Post-Quantum Cryptography", relation: "necessitates" },
    { source: "Superconducting Qubits", target: "Quantum Computing", relation: "implements" },
  ],
  article: `## Introduction

The field of quantum computing has experienced remarkable progress in recent years, with significant implications for the future of information security and cryptography. As quantum processors continue to scale and error correction techniques improve, the threat to current cryptographic systems becomes increasingly tangible [1]. This research article examines the latest advances in quantum computing technology, their potential impact on existing cryptographic infrastructure, and the emerging field of post-quantum cryptography designed to address these challenges.

The urgency of this topic cannot be overstated. Current public-key cryptographic systems, including RSA and elliptic curve cryptography (ECC), form the backbone of secure communications across the internet [2]. These systems rely on mathematical problems that are computationally intractable for classical computers but can be efficiently solved by sufficiently powerful quantum computers using Shor's algorithm [3].

## Current State of Quantum Computing

### Hardware Advances

Recent developments in quantum hardware have demonstrated unprecedented progress. IBM's latest quantum processors have surpassed 1,000 qubits, while Google's Willow chip achieved a breakthrough in quantum error correction, reducing error rates by a factor of two with each additional layer of qubits [1][4]. These advances represent significant steps toward building fault-tolerant quantum computers capable of running complex algorithms.

The competition among quantum computing approaches continues to intensify. Superconducting qubits, used by IBM and Google, offer fast gate operations and established fabrication techniques [5]. Meanwhile, trapped-ion systems developed by IonQ and Quantinuum demonstrate superior coherence times and connectivity [6]. Neutral atom platforms, pursued by companies like QuEra, show promise for scaling to thousands of qubits [7].

### Error Correction Milestones

Quantum error correction represents perhaps the most critical frontier in quantum computing development. Google's recent demonstration showed that their surface code implementation achieved logical error rates below physical error rates—a crucial threshold for practical quantum computing [4]. This milestone suggests that fault-tolerant quantum computing may be achievable within the next decade.

The path to a cryptographically relevant quantum computer (CRQC)—one capable of breaking current encryption—requires approximately 4,000 error-corrected logical qubits [8]. Current estimates suggest this capability could emerge between 2030 and 2040, though some experts warn that unexpected breakthroughs could accelerate this timeline [9].

## The Quantum Threat to Cryptography

### Vulnerable Systems

Shor's algorithm, discovered in 1994, provides a polynomial-time quantum algorithm for integer factorization and discrete logarithm problems [3]. This directly threatens:

- **RSA encryption**: Used in TLS/SSL, email encryption, and digital signatures
- **Elliptic Curve Cryptography (ECC)**: Foundation of Bitcoin and modern secure communications
- **Diffie-Hellman key exchange**: Fundamental protocol for secure key establishment

The implications extend beyond real-time communications. Adversaries employing "harvest now, decrypt later" strategies are already collecting encrypted data for future decryption once quantum capabilities mature [10]. This poses particular risks for information that must remain confidential for decades, including government secrets, medical records, and financial data.

### Grover's Algorithm Impact

While Shor's algorithm poses an existential threat to public-key cryptography, Grover's algorithm provides a quadratic speedup for searching unstructured databases [11]. This effectively halves the security level of symmetric encryption algorithms:

- AES-128 reduces to approximately 64-bit security
- AES-256 reduces to approximately 128-bit security

Consequently, security experts recommend transitioning to AES-256 for symmetric encryption to maintain adequate post-quantum security margins [12].

## Post-Quantum Cryptography Standards

### NIST Standardization Process

The National Institute of Standards and Technology (NIST) initiated its Post-Quantum Cryptography Standardization Process in 2016, evaluating 69 candidate algorithms [13]. After multiple rounds of analysis, NIST announced its first post-quantum cryptography standards in 2024:

**Key Encapsulation Mechanisms (KEMs):**
- **ML-KEM (CRYSTALS-Kyber)**: Based on the Module Learning With Errors (MLWE) problem, offering excellent performance and compact key sizes [14]

**Digital Signature Algorithms:**
- **ML-DSA (CRYSTALS-Dilithium)**: Lattice-based signature scheme with balanced performance
- **SLH-DSA (SPHINCS+)**: Hash-based signatures providing conservative security assumptions
- **FN-DSA (FALCON)**: Compact signatures based on NTRU lattices [15]

### Lattice-Based Cryptography

Lattice-based cryptography has emerged as the leading approach for post-quantum security [16]. These schemes derive their security from the difficulty of solving problems in high-dimensional lattices, such as:

- Learning With Errors (LWE)
- Ring Learning With Errors (Ring-LWE)
- Module Learning With Errors (MLWE)

The mathematical hardness of these problems is believed to persist against both classical and quantum attacks, making them suitable foundations for long-term cryptographic security [17].

## Migration Strategies and Organizational Readiness

### Cryptographic Agility

Organizations must develop cryptographic agility—the ability to quickly transition between cryptographic algorithms without major infrastructure changes [18]. Key principles include:

1. **Inventory assessment**: Cataloging all cryptographic dependencies
2. **Risk prioritization**: Identifying systems with longest data sensitivity periods
3. **Hybrid approaches**: Deploying classical and post-quantum algorithms in parallel
4. **Testing infrastructure**: Validating performance and compatibility

### Industry Responses

Major technology companies have begun implementing post-quantum protections. Google deployed hybrid key exchange in Chrome, combining X25519 with ML-KEM [19]. Apple announced PQ3 protocol for iMessage, providing post-quantum security for messaging [20]. Signal messenger integrated PQXDH, a post-quantum key agreement protocol [21].

Financial institutions face particular urgency given regulatory requirements and long data retention periods. The European Central Bank has issued guidance on quantum risk assessment, while the Bank for International Settlements has published frameworks for quantum-safe financial infrastructure [22].

## Conclusion

The quantum computing revolution presents both unprecedented opportunities and significant security challenges. While cryptographically relevant quantum computers remain years away, the "harvest now, decrypt later" threat demands immediate action. The standardization of post-quantum cryptographic algorithms by NIST provides a clear path forward, but successful migration requires careful planning, substantial investment, and organizational commitment.

Key takeaways for organizations include:

1. Begin cryptographic inventory assessments immediately
2. Prioritize long-sensitivity data protection
3. Adopt hybrid classical/post-quantum approaches during transition
4. Develop cryptographic agility as a core capability
5. Monitor quantum computing developments and adjust timelines accordingly

The transition to quantum-safe cryptography represents one of the most significant infrastructure changes in the history of information security. Organizations that act proactively will be best positioned to protect their data and maintain trust in an increasingly quantum-enabled world [23][24].

## References

[1] IBM Research. Quantum Computing Reaches New Milestone with 1000+ Qubit Processors. https://www.nature.com/articles/quantum-computing-2024

[2] Boneh, D., & Shoup, V. A Graduate Course in Applied Cryptography. https://toc.cryptobook.us/

[3] Shor, P. Algorithms for Quantum Computation: Discrete Logarithms and Factoring. https://ieeexplore.ieee.org/document/365700

[4] Google Quantum AI. Quantum Error Correction Below the Surface Code Threshold. https://www.nature.com/articles/s41586-024-quantum-error

[5] Krantz, P. et al. A Quantum Engineer's Guide to Superconducting Qubits. https://arxiv.org/abs/1904.06560

[6] Bruzewicz, C. D. et al. Trapped-Ion Quantum Computing: Progress and Challenges. https://arxiv.org/abs/1904.04178

[7] Evered, S. J. et al. High-Fidelity Parallel Entangling Gates on a Neutral-Atom Quantum Computer. https://www.nature.com/articles/s41586-023-06481-y

[8] Gidney, C., & Ekerå, M. How to Factor 2048 Bit RSA Integers in 8 Hours Using 20 Million Noisy Qubits. https://arxiv.org/abs/1905.09749

[9] Mosca, M. Cybersecurity in an Era with Quantum Computers. https://globalriskinstitute.org/publications/quantum-computing-cybersecurity/

[10] CISA. Post-Quantum Cryptography Initiative. https://www.cisa.gov/quantum

[11] Grover, L. K. A Fast Quantum Mechanical Algorithm for Database Search. https://arxiv.org/abs/quant-ph/9605043

[12] NIST. Transitioning to Post-Quantum Cryptography. https://www.nist.gov/pqc-migration

[13] NIST. Post-Quantum Cryptography Standardization. https://csrc.nist.gov/projects/post-quantum-cryptography

[14] Avanzi, R. et al. CRYSTALS-Kyber Algorithm Specifications. https://pq-crystals.org/kyber/

[15] Ducas, L. et al. FALCON: Fast-Fourier Lattice-based Compact Signatures over NTRU. https://falcon-sign.info/

[16] Peikert, C. A Decade of Lattice Cryptography. https://eprint.iacr.org/2015/939

[17] Regev, O. On Lattices, Learning with Errors, Random Linear Codes, and Cryptography. https://cims.nyu.edu/~regev/papers/lwesurvey.pdf

[18] NSA. Quantum Computing and Post-Quantum Cryptography. https://www.nsa.gov/Cybersecurity/Post-Quantum-Cryptography/

[19] Google Security Blog. Protecting Chrome Traffic with Hybrid Kyber KEM. https://security.googleblog.com/2023/08/protecting-chrome-traffic-with-hybrid.html

[20] Apple Security Research. PQ3: A New iMessage Security Protocol. https://security.apple.com/blog/imessage-pq3/

[21] Signal. The PQXDH Key Agreement Protocol. https://signal.org/docs/specifications/pqxdh/

[22] BIS. Project Leap: Quantum-Proof Financial System. https://www.bis.org/about/bisih/topics/suptech_regtech/leap.htm

[23] World Economic Forum. Quantum Computing Governance Principles. https://www.weforum.org/publications/quantum-computing-governance-principles/

[24] ENISA. Post-Quantum Cryptography: Current State and Quantum Mitigation. https://www.enisa.europa.eu/publications/post-quantum-cryptography`,
  citations: [
    { index: 1, url: "https://www.nature.com/articles/quantum-computing-2024", title: "Quantum Computing Reaches New Milestone" },
    { index: 2, url: "https://toc.cryptobook.us/", title: "A Graduate Course in Applied Cryptography" },
    { index: 3, url: "https://ieeexplore.ieee.org/document/365700", title: "Algorithms for Quantum Computation" },
    { index: 4, url: "https://www.nature.com/articles/s41586-024-quantum-error", title: "Quantum Error Correction Below the Surface Code Threshold" },
    { index: 5, url: "https://arxiv.org/abs/1904.06560", title: "A Quantum Engineer's Guide to Superconducting Qubits" },
    { index: 6, url: "https://arxiv.org/abs/1904.04178", title: "Trapped-Ion Quantum Computing: Progress and Challenges" },
    { index: 7, url: "https://www.nature.com/articles/s41586-023-06481-y", title: "High-Fidelity Parallel Entangling Gates" },
    { index: 8, url: "https://arxiv.org/abs/1905.09749", title: "How to Factor 2048 Bit RSA Integers" },
    { index: 9, url: "https://globalriskinstitute.org/publications/quantum-computing-cybersecurity/", title: "Cybersecurity in an Era with Quantum Computers" },
    { index: 10, url: "https://www.cisa.gov/quantum", title: "CISA Post-Quantum Cryptography Initiative" },
  ],
  qualityScores: {
    comprehensiveness: 8.5,
    insight: 8.2,
    instruction_following: 9.0,
    readability: 8.7,
  },
  searchIterations: 3,
  revisions: 1,
};
