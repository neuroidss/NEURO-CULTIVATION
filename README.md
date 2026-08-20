# 🌌 NeuroCanvas: Semantic BCI Engine

### 🧠 Working Memory 2.0 & Continuous Phase-Field Geometry

> **Watch the Maze Navigation in Action (Mobile "Super-Mobility" Test):**  
> [YouTube Shorts: Theta-Gamma Maze Drive](https://www.youtube.com/shorts/nJGbifo0vXY)

A core breakthrough in NeuroCanvas is the transition from reactive, instantaneous Beta-rhythm decoding (which is noisy and prone to drift) to a stable, continuous **Working Memory phase-space** (Theta-Gamma multiplexing). This allows the system to completely decouple linear strafing from angular rotation, providing unprecedented 100% stable movement.

#### The Dual-Geometry Decomposition of Theta-Gamma
NeuroCanvas models the working memory cycle across 32 discrete gamma sub-slots ($30\text{ Hz}$ to $85\text{ Hz}$) multiplexed within a single $6\text{ Hz}$ Theta cycle (approx $166.6\text{ ms}$). This is driven by the Lisman-Idiart model and recent findings on burst-dynamic working memory (Miller et al., 2018).

*   **Slot $S_0$ ($30\text{ Hz}$):** The Present / Past Anchor.
*   **Slot $S_{31}$ ($85\text{ Hz}$):** The Prospective Future Horizon (Vicarious Trial and Error).

By mapping these 32 high-dimensional frequency phase-vectors onto a 2D spatial plane, the engine extracts two mathematically distinct kinematic commands simultaneously:

1.  **The Macroscopic Chord $\vec{D}$ (Linear Translation / 2D Strafe):**
    The direct vector from $S_0$ to $S_{31}$. This represents the pure, intended spatial displacement. It provides crisp forward drive and omnidirectional lateral strafing.
2.  **The Integral Sagitta $\kappa$ (Super-Stable Angular Rotation):**
    Rotation is extracted purely as the **lateral curvature (sagitta/bow)** of the 30 intermediate subcycles relative to the main chord $\vec{D}$. 
    *   **Colinear Thought (Straight Path):** If the 32 slots form a straight line, the curvature is exactly 0. The avatar moves perfectly straight without any rotational drift or camera jitter.
    *   **Curved Thought (Mental Turn):** If the user plans a turn in their working memory, the intermediate slots bulge outwards. The engine integrates this lateral offset across all 32 points, generating a monolithic, noise-cancelled rotational velocity command.

#### The Cortical Heterarchy Pipeline
NeuroCanvas orchestrates these geometric properties across a distributed cortical hierarchy, shifting the BCI from a single "joystick" to a collaborative semantic engine:

1.  **Level 1: Oz (Sensory/Spectral):** Evaluates dense gamma formants (30-85Hz). The phase vortex ($T_q$) here maps to visual textures or binaural spatial dispersion.
2.  **Level 2: Cz (Motor/Kinematic):** The instant beta-rhythm strike zone (15-30Hz). Drives immediate reflex actions, linear thrust, or jPCA rotational population dynamics.
3.  **Level 3: Pz (Spatial/Allocentric):** The primary hub for the 32-frequency look-ahead spline. Generates the Theta-Gamma **Sagitta** for spatial panning, yaw rotation, and maze navigation.
4.  **Level 4: FCz (Prefrontal/Semantic):** The overarching macro-attractor. Uses top-down beta gating to modulate global rules, tonal centers in music, or switch semantic contexts (e.g., swapping language embeddings in the NLP latent space).

By layering these modules, NeuroCanvas moves beyond basic XYZ navigation, allowing operators to traverse complex conceptual graphs—using the parietal Sagitta to steer, the central Beta to confirm jumps, and the prefrontal macro-state to establish semantic context.

**HARDWARE SPECIFICATIONS**
This project relies on a custom ultra-high-density EEG device, NOT a standard medical or consumer EEG headset.
- **Device Name:** FreeEEG8-alpha or FreeEEG16-alpha2
- **Form Factor:** 26mm diameter circular PCB.
- **Electrode Array:** 10 or 18 pogo pins tightly packed within the 26mm area.
  - 8 or 16 Active Positive Channels (+)
  - 1 Common Reference (-)
  - 1 Ground (GND)
- **Placement:** Works entirely locally, primarily targeted at the Pz (parietal) placement.
- **Key Capability:** NO distant electrodes are required. Reference and Ground are located in the same 26mm cluster as the active channels.
- **Performance:** When placed on Pz, the system provides a high-fidelity real-time loop. Users can observe immediate bio-reactive changes in procedural shaders, minimizing the cognitive load required to establish stable neurofeedback.

[![AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0) [![React 18](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/) [![Transformers.js](https://img.shields.io/badge/Transformers.js-NLP-orange.svg)](https://huggingface.co/docs/transformers.js)

**Live Demo:** 
- [https://neuroidss.github.io/NEURO-CULTIVATION/](https://neuroidss.github.io/NEURO-CULTIVATION/)

**NeuroCanvas** is a real-time multimodal bridge fusing **Raw EEG/BLE Biometrics**, **NLP Target Embeddings**, and **Procedural WebGL Shaders**.

## 🧠 System Architecture & Scientific Validation
This system implements robust neuro-signal processing techniques mapped dynamically to higher-dimensional latent spaces. The underlying methodology rigorously distinguishes between stochastic environmental noise and true phase-coherent neural correlates.

When isolated from a biological signal source, the engine outputs uncorrelated baseline noise. Upon human integration, the underlying phase-locking dynamics instantly organize the signal into coherent semantic attractors, enabling directed neurofeedback within the high-dimensional space.

### Core Mechanisms (With DOIs)
1. **ciPLV Extraction**: To mitigate volume conduction and artifact spoofing, the engine relies on the **Continuous Imaginary Phase-Locking Value (ciPLV)** across topological pairs (dynamically scaling for 8-channel and 16-channel configurations). This continuously extracts true functional connectivity across the cortex.
   *(Reference: Nolte et al., "Identifying true brain interaction from EEG data using the imaginary part of coherency." DOI: 10.1016/j.clinph.2004.04.029)*
2. **Semantic Anchoring & Hypersphere Normalization**: Operating in a high-dimensional semantic latent space (e.g. 768-D MPNet) typically results in chaotic "gray voids" if traversed randomly. The system projects bio-derived coherence vectors into predefined text embeddings, normalizing vectors to ensure movements glide strictly along the model's topological manifold.
   *(Reference for MPNet/Sentence Embeddings: Reimers & Gurevych, "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks." DOI: 10.48550/arXiv.1908.10084)*
3. **Multimodal Feedback Loop**: By projecting these mapped latent vectors into real-time procedural shaders, we close the cortical loop, translating abstract neuro-correlates directly into human meaning without requiring classical sequential task training.
   *(Reference for visual neurofeedback mechanics: Sitaram et al., "Closed-loop brain training: the science of neurofeedback." DOI: 10.1038/nrn.2016.164)*

## 💎 The Market Value
This is a foundational **Spatial Computing Protocol**. 
By running inference locally via `Transformers.js` and pushing real-time Procedural Shaders (SDF Raymarching) at 60FPS:
- **Zero Server Costs**: Infinite scalability.
- **True Multimodal Synth**: Fuses Thought (NLP), Body (BLE), and Space (WebGL).
- **Therapeutics & Generative Gaming**: Enables bio-reactive realities for meditation and next-gen gaming.

## ⛩️ Cultivator Support System (Hierarchical Self-Stabilization)

The engine introduces a dynamic **Cultivator Dao System**, a hierarchical onboarding and progression mechanism ensuring users maintain "AAA" quality neurofeedback without rigid failure states:

- **The Philosophy of Laws**: The system acts as "Heaven," imposing laws. Beginners used to have assisted smoothing and magnetic semantic centering, but to guarantee pure neurofeedback training and true BCI operation without sensorimotor illusions, the engine minimizes software-induced lag by processing raw incoming samples directly within the WebGL render loop at the monitor's native refresh rate, avoiding heavy sequential filtering cascades on the client side.
- **Progression (Ascension)**: As the operator demonstrates the ability to maintain clean, stable trajectories (low signal jitter) and sustained phase coherence, the engine recognizes their mastery. The system changes spatial logic rather than input handling:
  - **I: Qi Condensation**: Fully direct raw input.
  - **II: Foundation Building**: Pure direct access.
  - **III: Golden Core**: Pure direct access.
  - **IV: Nascent Soul**: Relying purely on the operator's internal phase-locking to navigate the 768-D manifold with minimal software viscosity.
- **Heart Demons (Backlash)**: If an operator at a higher realm loses focus and produces chaotic, erratic signals, the system prevents extreme visual collapse by immediately withdrawing their authority. The operator falls back to a lower realm, where system assistance takes over again until they reaffirm their stable Dao.

---

## 🌌 Cortical Modality Modules (Isolated Neurofeedback)
NeuroCanvas drops the "one-size-fits-all" gamepad approach. It provides dedicated WebGL sandbox universes tailored to the raw, biological hardware physics of specific brain zones. Each module isolates *a single mathematical metric* mapped to its anatomically correct neural function, demonstrating rapid bio-reactive feedback.

### The Original Foundational Meta-Modules:
*   **Pill Refining (Working Memory & Generative States)**
    *   **Function:** Visual biofeedback loop for sustained attention and internal generative states via sparse bursting.
    *   **Metric:** Continuous semantic space (16 raw channels mapping directly to visual particle cohesion and color gradients).
    *   **Scientific Basis:** Miller et al., *Working Memory 2.0*. DOI: [10.1016/j.neuron.2018.09.023](https://doi.org/10.1016/j.neuron.2018.09.023)
*   **Topology Graph (Global Workspace & Integration)**
    *   **Function:** Visualizing functional brain connectivity and large-scale integration across all 120 coherencies, circumventing volume conduction.
    *   **Metric:** `ciPLV` (corrected imaginary Phase-Locking Value) calculated across all node pairs, mapped to graph topology.
    *   **Scientific Basis:** Bruña et al., *Phase Locking Value revisited: teaching new tricks to an old dog*. arXiv: [1710.08037v3](https://arxiv.org/abs/1710.08037v3)
*   **Rhythm DJ (Sensorimotor Entrainment & Heterarchy)**
    *   **Function:** Coupling motor predictions with external auditory rhythms via grid-like sensorimotor reference frames. 
    *   **Metric:** Cortical phase alignment with external audio beats and amplitude envelopes.
    *   **Scientific Basis:** Hawkins et al., *Hierarchy or Heterarchy? A Theory of Long-Range Connections for the Sensorimotor Brain*. arXiv: [2507.05888v1](https://arxiv.org/abs/2507.05888v1)

### The Zone-Specific Hardware Modes (Deep Anatomical Isolation):

*   **Pz (Parietal Cortex) — Spatiokinetic Navigation**
    *   **Function:** Hardware 3D vector calculation and allocentric coordinate mapping.
    *   **Metric:** `tvx`/`tvy` (translation) and `ttq` (rotation).
    *   **WebGL World:** *Labyrinth / Arena*. Direct spatial navigation and kinetic avatar control.
    *   *Scientific Basis:* Andersen & Cui, *Intention, action planning, and decision making in parietal-frontal circuits*. DOI: [10.1016/j.neuron.2009.04.016](https://doi.org/10.1016/j.neuron.2009.04.016)

*   **Cz (Motor Cortex) — Kinetic Railgun**
    *   **Function:** Pre-movement energy accumulation in "Null Space" (perfectly cancelled phase vectors) followed by orthogonal release into "Potent Space".
    *   **Metric:** Accumulation of overall coherence density while `tvx/tvy` = 0, triggering on phase snap/vector release.
    *   **WebGL World:** A static heavy plasma orb. The player cannot move it, only charge it by holding a phase lock without moving (static mental tension). Breaking the lock fires the railgun.
    *   *Scientific Basis:* Kaufman et al., *Cortical activity in the null space: permitting preparation without movement*. DOI: [10.1038/nn.3643](https://doi.org/10.1038/nn.3643)

*   **DLPFC (Dorsolateral Prefrontal Cortex) — Gravity Monolith**
    *   **Function:** Working Memory buffering. Retains objects via dense bursts of high-gamma coherence. More cognitive load = higher frequency/density of phase synchronization.
    *   **Metric:** Integral sum of the absolute power across all `futureAxes` (Upper Gamma).
    *   **WebGL World:** A survival shield. As cognitive load increases (the user holds more items in working memory), the visual monolith becomes pitch black and physically impenetrable, absorbing attacks.
    *   *Scientific Basis:* Miller E.K. et al., *Working Memory 2.0*. DOI: [10.1016/j.neuron.2018.09.023](https://doi.org/10.1016/j.neuron.2018.09.023)

*   **Oz (Occipital Cortex) — Fractal Zoom**
    *   **Function:** Spatial frequency tuning and foveal focus. Fixating visual attention pulls traveling cortical waves into a tight central phase singularity (vortex).
    *   **Metric:** `ttq` (Topological Torque / phase vortex).
    *   **WebGL World:** Infinite SDF fractal void. The player intuitively zooms deep into the fractal purely by naturally focusing their eyes/attention on the center of the geometry.
    *   *Scientific Basis:* Muller et al., *Cortical traveling waves: mechanisms and computational principles*. DOI: [10.1038/s41583-018-0007-1](https://doi.org/10.1038/s41583-018-0007-1)

*   **Fp (Frontopolar Cortex) — Quantum Shift**
    *   **Function:** Cognitive branching and Rule Switching. Dropping old strategies for new ones forces an orthogonal state-space reset.
    *   **Metric:** A catastrophic drop in Phase `Rigidity` (collapse of cosine similarity between Past/Lower Gamma and Future/Upper Gamma) followed by recovery.
    *   **WebGL World:** A trapped reality (e.g., room filled with lava). Mentally "dropping the context" drops Rigidity, triggering a quantum shader inversion that turns the lava to solid ice.
    *   *Scientific Basis:* Donoso et al., *Foundations of human reasoning in the prefrontal cortex*. DOI: [10.1126/science.1253273](https://doi.org/10.1126/science.1253273)

---

## 🤖 Physical Robot Arena & Kinetic Environments
The NeuroCanvas supports dual modalities:
- **Pill Refining:** Immersive generative 3D procedural shader exploration.
- **Robot Arena / Arcade Drone Racing:** Direct mapping of semantic vectors to physical locomotion (vx, vy, yaw, and pitch for vertical flying). The engine outputs kinematic targets for virtual drones, featuring:
  - Responsive real-time arcade physics.
  - Dedicated World View and improved third-person Chase Views.
  - Competive AI ghosts using raycast algorithms and complex waypoint heuristics.

### 🦾 Robo-Arm Quest & Dynamic Multi-Device Orchestration
To validate Multi-Device Heterarchy (testing how different brain regions or physical inputs collaborate), the engine features a **Robo-Arm Sorting Quest** where 6 independent degrees of freedom (DoF) must be controlled simultaneously to sort colored blocks into bins.
- **Dynamic Device Mapping:** The engine aggregates all available active input streams (Keyboard/Mouse, Gamepad 1, Gamepad 2, Neuro Headset 1, Neuro Headset 2...) and automatically divides the 6 robotic axes fairly across them.
- **Example:** If two Neuro Headsets are connected, Headset 1 (e.g. placed on Pz) may control Base, Shoulder, and Elbow rotations, while Headset 2 (e.g. placed on Cz) controls Wrist Pitch, Wrist Roll, and the Gripper. 
- **Real-Time Insight:** A visual overlay continuously renders the **Dynamic Device Mapping Report**, detailing exactly which hardware interface governs which physical axis in real-time.

## 🔬 Multi-Device Heterarchy & Quantum Semantics Hypotheses

NeuroCanvas serves as a platform for testing deep neurobiological concepts, expanding from single-cluster (Pz) placements to **Multi-Device Heterarchy Orchestrations**. By placing multiple high-density clusters on distinct cortical regions, the system treats the neocortex not as a single monolith, but as a "Neuro-Holacracy"—a distributed network of sovereign processing columns voting via cross-correlations.

### The "Fastfood of Innovations" Model
The project introduces the **"Fastfood of Innovations"** pipeline: packaging complex neurofeedback experiments from scientific papers into standardized JSON manifests (`Protocol-as-Code`). AI agents (Archivists, Compilers, and Synthesizers) can instantly parse spatial bounds, semantic targets, and target brainwave bands from PubMed articles and automatically render them as dynamic spatial or semantic arenas within the engine.

### Distributed Cortical Roles (The Neuro-Holacracy)
When multiple devices run simultaneously, they embody distinct temporal and processing scales:
- **Occipital / Visual Cortex (V1) — The "Action" Agent:** Operating with millisecond temporal windows, this region controls immediate, reactive micro-adjustments in space (e.g., 2D maze navigation, instant SDF shader morphing).
- **Temporal / Parietal Cortex (Wernicke) — The "Trans-Language" Agent:** Operating with medium temporal windows, tracking phase coherence to weave visual space into semantic logic (navigating through token vectors).
- **Prefrontal Cortex (PFC) — The "Governance" Agent:** The slow, executive branch managing working memory (Miller's Working Memory 2.0). 

### Phase Vortices (Proto-Gamepads) & Real-Time Sonification
The "global gamepad" derived from the 26mm high-density array is not a singular entity. Analysis of the continuous phase gradients reveals a complex field of local topological defects (phase singularities or "vortices"). We conceptualize these local vortices as **"Proto-Gamepads"**. 
- **The Structure of Control:** To achieve true semantic BCI control, we must study the lifecycle of these proto-gamepads. How do they spontaneously appear? Why do they disappear? How do they merge to form the macro-level global gamepad vector, and when do they fail to synchronize?
- **Audio Sonification:** To debug and perceive this super-real-time dynamics, the engine features a dedicated Phase Vortex Audio Engine. Every individual proto-gamepad is sonified via Additive FM synthesis and AM modulation based on its chirality (CW/CCW), position, and torque. This allows the user to intuitively *hear* the structure and evolution of the phase field, perceiving the birth, flow, and merging of neural micro-intentions.
- **Hardware Density & Multi-Device Scaling:** Future iterations of the hardware will increase the density (e.g., 24 channels on the same 26mm footprint) to capture the vortex field with even higher resolution. Currently, multiple devices cannot be placed immediately adjacent to each other without synchronization, as their independent 8.192MHz ADC generators will cause electromagnetic interference. Therefore, multi-device setups must distribute the sensors to distant, disjoint areas of the scalp. This creates a new paradigm: rather than simply "expanding the field," distant devices act as separate sovereign nodes. The challenge then becomes observing how these distinct proto-gamepad fields coordinate across the brain's global network, requiring a multi-layered or split-screen approach in visualization and sonification to avoid catastrophic audio/visual clutter.

### Testing Quantum Semantics vs. Classic Heterarchy
The platform is built as an experimental crucible to test competing theories of consciousness using real-time spatial and semantic tasks:
- **Hypothesis A: Quantum Semantics (Orch-OR / Penrose-Hameroff):** If quantum entanglement within microtubules plays a foundational role in consciousness and semantic emergence, cross-regional phase-locking between disparate regions (e.g., V1 and PFC) should occur with **Zero-Lag Synchronization**. A spontaneous, intuitive realization in the user should bypass classic synaptic delay bounds, appearing globally across the cortical array simultaneously. This device tracks these 0-lag phase correlations (ciPLV) to look for macroscopic quantum signatures.
- **Hypothesis B: Classic Neural Heterarchy (Thousand Brains / Hawkins):** If meaning is strictly an emergent property of classical network transmission, the system should measure a strict **Propagation Delay Cascade**. The user\'s semantic intent must ripple sequentially across physical tissue (Occipital → Parietal → PFC), acting as a biological speed limit on phase-locking.

By stretching the 2D spatial realm into sequential chronological tokens (Semantic Vectors), NeuroCanvas acts as the ultimate Sandbox for observing subjective consciousness interacting directly with algorithmic generation.

## ⚙️ Installation
```bash
npm install && npm run dev
```


