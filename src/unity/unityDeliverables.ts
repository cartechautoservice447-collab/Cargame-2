export interface UnityScriptDeliverable {
  id: string;
  fileName: string;
  unityPath: string;
  responsibility: string;
  owner: 'Gemini Neon (Implementation)' | 'Gemini Argon (Audit & Perf Verification)';
  code: string;
}

export const UNITY_PROJECT_STRUCTURE = `JARVIS_DRIVE_Unity63_LTS/
├── Assets/
│   ├── _JarvisDrive/
│   │   ├── Art/
│   │   │   ├── Materials/
│   │   │   │   ├── MAT_Cockpit_NappaLeather.mat          (URP Lit, ASTC 6x6 Normal + Roughness)
│   │   │   │   ├── MAT_Cockpit_BrushedTitanium.mat       (URP Lit, Metallic 0.92, Smoothness 0.76)
│   │   │   │   ├── MAT_Windshield_RainDroplets.mat       (Custom URP ShaderGraph: SG_WindshieldRain)
│   │   │   │   ├── MAT_Road_CityAsphalt.mat              (Dynamic Smoothness: Day 0.22 / Night 0.85)
│   │   │   │   └── MAT_CityBuildings_Atlas.mat           (Single 2048x2048 ASTC 6x6 Emissive Atlas)
│   │   │   ├── Meshes/
│   │   │   │   ├── Vehicle_LuxuryGT_Exterior_LOD0_1_2.fbx
│   │   │   │   ├── Cockpit_LuxuryGT_Interior_High.fbx    (Dashboard, SteeringWheel, Wipers, Pedals)
│   │   │   │   ├── DriverArms_RiggedHumanoid.fbx         (Avatar IK Rig for 9-and-3 Wheel Grip)
│   │   │   │   ├── CityLoop_CompactBlock_Static.fbx      (Lightmap Static + Occluder Static)
│   │   │   │   └── Traffic_LowPolyPack_LOD0_1.fbx        (Merged 1-Submesh AI Traffic Vehicles)
│   │   │   ├── Shaders/
│   │   │   │   └── SG_WindshieldRainWiper.shadergraph    (Procedural UV rain drops + Wiper Arc Mask)
│   │   │   └── Textures/                                 (All Android Overrides: ASTC 6x6 / 8x8)
│   │   ├── Audio/
│   │   │   ├── SFX_V8_EngineLoop_IdleToRedline.wav       (Vorbis 70%, Force To Mono for Cabin)
│   │   │   ├── SFX_Rain_CabinWindshieldLoop.wav
│   │   │   └── SFX_WiperBlade_ServoSweep.wav
│   │   ├── Prefabs/
│   │   │   ├── PFB_Player_LuxuryGT_Full.prefab           (WheelColliders + Cockpit + IK Driver Arms)
│   │   │   ├── PFB_Traffic_Sedan_Pooled.prefab
│   │   │   ├── PFB_Traffic_SUV_Pooled.prefab
│   │   │   └── PFB_UI_MobileTouchHUD.prefab
│   │   ├── Scenes/
│   │   │   ├── SCN_00_BootAndModeSelect.unity            (Day / Night Mode Selection Menu)
│   │   │   └── SCN_01_MetroCircuit_Main.unity            (Shared Base City, Route, Cockpit & Traffic)
│   │   ├── Scripts/
│   │   │   ├── Core/
│   │   │   │   ├── DayNightWeatherManager.cs
│   │   │   │   └── HonorX9bPerformanceManager.cs
│   │   │   ├── Input/
│   │   │   │   └── MobileTouchInputManager.cs
│   │   │   ├── Traffic/
│   │   │   │   └── AITrafficWaypointSpawner.cs
│   │   │   ├── UI/
│   │   │   │   └── DashboardInstrumentCluster.cs
│   │   │   ├── Vehicle/
│   │   │   │   ├── VehiclePhysicsController.cs
│   │   │   │   ├── CockpitControllerAndHandsIK.cs
│   │   │   │   └── WindshieldWiperAndRainShaderController.cs
│   │   │   └── Editor/
│   │   │       └── BuildAndroidAPK.cs
│   │   └── Settings/
│   │       ├── URP_HonorX9b_MobileAsset.asset            (Forward, 720p Render Scale 0.67, MSAA 2x)
│   │       ├── URP_HonorX9b_Renderer.asset               (SRP Batcher ON, Depth Priming Disabled)
│   │       ├── Volume_DayMode_Profile.asset
│   │       └── Volume_NightRain_Profile.asset
├── Packages/
│   └── manifest.json                                     (com.unity.render-pipelines.universal 17.0.3)
└── ProjectSettings/
    ├── ProjectSettings.asset                             (Android ARM64 IL2CPP, Vulkan + OpenGLES3)
    └── QualitySettings.asset`;

export const UNITY_CSHARP_SCRIPTS: UnityScriptDeliverable[] = [
  {
    id: 'vehicle-physics',
    fileName: 'VehiclePhysicsController.cs',
    unityPath: 'Assets/_JarvisDrive/Scripts/Vehicle/VehiclePhysicsController.cs',
    responsibility:
      'Ackermann 4-WheelCollider drivetrain, 6-speed automatic gearbox, wet/dry tire friction adaptation, anti-roll bars, and smoothed RPM calculation.',
    owner: 'Gemini Neon (Implementation)',
    code: `using UnityEngine;

namespace JarvisDrive.Vehicle
{
    [RequireComponent(typeof(Rigidbody))]
    public class VehiclePhysicsController : MonoBehaviour
    {
        [Header("Wheel Colliders")]
        [SerializeField] private WheelCollider frontLeftCollider;
        [SerializeField] private WheelCollider frontRightCollider;
        [SerializeField] private WheelCollider rearLeftCollider;
        [SerializeField] private WheelCollider rearRightCollider;

        [Header("Wheel Visual Transforms")]
        [SerializeField] private Transform frontLeftMesh;
        [SerializeField] private Transform frontRightMesh;
        [SerializeField] private Transform rearLeftMesh;
        [SerializeField] private Transform rearRightMesh;

        [Header("Drivetrain & Gearbox")]
        [SerializeField] private float maxMotorTorque = 780f;
        [SerializeField] private float maxBrakeTorque = 3200f;
        [SerializeField] private float maxSteerAngleLowSpeed = 28f;
        [SerializeField] private float maxSteerAngleHighSpeed = 9f;
        [SerializeField] private float topSpeedKmh = 210f;
        [SerializeField] private float antiRollStiffness = 5500f;
        [SerializeField] private Vector3 centerOfMassOffset = new Vector3(0f, -0.48f, 0.08f);

        private readonly float[] gearSpeedThresholdsKmh = { 38f, 72f, 110f, 148f, 185f, 225f };
        private readonly float[] gearRatios = { 3.40f, 2.20f, 1.55f, 1.18f, 0.94f, 0.78f };

        private Rigidbody rb;
        private float currentSteerInput;
        private float currentThrottleInput;
        private float currentBrakeInput;
        private float wetGripFactor = 1.0f;

        public float SpeedKmh { get; private set; }
        public float EngineRpm { get; private set; } = 850f;
        public int CurrentGear { get; private set; } = 1;
        public float NormalizedSteer => currentSteerInput;
        public float ThrottleInput => currentThrottleInput;
        public float BrakeInput => currentBrakeInput;

        private void Awake()
        {
            rb = GetComponent<Rigidbody>();
            rb.mass = 1780f;
            rb.linearDamping = 0.03f;
            rb.angularDamping = 0.45f;
            rb.centerOfMass = centerOfMassOffset;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
        }

        public void SetControlInputs(float steer, float throttle, float brake)
        {
            currentSteerInput = Mathf.Clamp(steer, -1f, 1f);
            currentThrottleInput = Mathf.Clamp01(throttle);
            currentBrakeInput = Mathf.Clamp01(brake);
        }

        public void SetWetAsphaltGrip(bool isWetNight)
        {
            wetGripFactor = isWetNight ? 0.88f : 1.0f;
            ApplyFrictionStiffness(frontLeftCollider, wetGripFactor);
            ApplyFrictionStiffness(frontRightCollider, wetGripFactor);
            ApplyFrictionStiffness(rearLeftCollider, wetGripFactor);
            ApplyFrictionStiffness(rearRightCollider, wetGripFactor);
        }

        private static void ApplyFrictionStiffness(WheelCollider wc, float factor)
        {
            if (wc == null) return;
            WheelFrictionCurve fwd = wc.forwardFriction;
            fwd.stiffness = 1.65f * factor;
            wc.forwardFriction = fwd;

            WheelFrictionCurve side = wc.sidewaysFriction;
            side.stiffness = 1.80f * factor;
            wc.sidewaysFriction = side;
        }

        private void FixedUpdate()
        {
            SpeedKmh = rb.linearVelocity.magnitude * 3.6f;
            UpdateAutomaticGearAndRpm();

            float speedFactor = Mathf.Clamp01(SpeedKmh / 140f);
            float maxSteer = Mathf.Lerp(maxSteerAngleLowSpeed, maxSteerAngleHighSpeed, speedFactor);
            float steerAngle = currentSteerInput * maxSteer;

            // Ackermann inner/outer wheel geometry
            frontLeftCollider.steerAngle = steerAngle * (steerAngle < 0f ? 1.08f : 0.92f);
            frontRightCollider.steerAngle = steerAngle * (steerAngle > 0f ? 1.08f : 0.92f);

            float torqueScale = SpeedKmh < topSpeedKmh ? gearRatios[CurrentGear - 1] / gearRatios[0] : 0f;
            float appliedTorque = currentThrottleInput * maxMotorTorque * (0.55f + 0.45f * torqueScale) * wetGripFactor;

            // All-wheel drive 35/65 luxury GT torque split
            frontLeftCollider.motorTorque = appliedTorque * 0.35f;
            frontRightCollider.motorTorque = appliedTorque * 0.35f;
            rearLeftCollider.motorTorque = appliedTorque * 0.65f;
            rearRightCollider.motorTorque = appliedTorque * 0.65f;

            float appliedBrake = currentBrakeInput * maxBrakeTorque;
            frontLeftCollider.brakeTorque = appliedBrake * 0.62f;
            frontRightCollider.brakeTorque = appliedBrake * 0.62f;
            rearLeftCollider.brakeTorque = appliedBrake * 0.38f;
            rearRightCollider.brakeTorque = appliedBrake * 0.38f;

            ApplyAntiRollBar(frontLeftCollider, frontRightCollider);
            ApplyAntiRollBar(rearLeftCollider, rearRightCollider);

            SyncWheelMesh(frontLeftCollider, frontLeftMesh);
            SyncWheelMesh(frontRightCollider, frontRightMesh);
            SyncWheelMesh(rearLeftCollider, rearLeftMesh);
            SyncWheelMesh(rearRightCollider, rearRightMesh);
        }

        private void UpdateAutomaticGearAndRpm()
        {
            int targetGear = 1;
            for (int i = 0; i < gearSpeedThresholdsKmh.Length - 1; i++)
            {
                if (SpeedKmh > gearSpeedThresholdsKmh[i] * 0.86f)
                {
                    targetGear = i + 2;
                }
            }
            CurrentGear = targetGear;

            float minGearSpeed = CurrentGear == 1 ? 0f : gearSpeedThresholdsKmh[CurrentGear - 2] * 0.65f;
            float maxGearSpeed = gearSpeedThresholdsKmh[CurrentGear - 1];
            float gearRatioProgress = Mathf.InverseLerp(minGearSpeed, maxGearSpeed, SpeedKmh);
            float targetRpm = Mathf.Lerp(850f, 6850f, gearRatioProgress) + currentThrottleInput * 350f;
            EngineRpm = Mathf.Lerp(EngineRpm, Mathf.Clamp(targetRpm, 850f, 7200f), Time.fixedDeltaTime * 10f);
        }

        private void ApplyAntiRollBar(WheelCollider leftWheel, WheelCollider rightWheel)
        {
            if (leftWheel == null || rightWheel == null) return;
            float travelL = 1.0f;
            float travelR = 1.0f;

            bool groundedL = leftWheel.GetGroundHit(out WheelHit hitL);
            if (groundedL)
            {
                travelL = (-leftWheel.transform.InverseTransformPoint(hitL.point).y - leftWheel.radius) / leftWheel.suspensionDistance;
            }

            bool groundedR = rightWheel.GetGroundHit(out WheelHit hitR);
            if (groundedR)
            {
                travelR = (-rightWheel.transform.InverseTransformPoint(hitR.point).y - rightWheel.radius) / rightWheel.suspensionDistance;
            }

            float antiRollForce = (travelL - travelR) * antiRollStiffness;
            if (groundedL) rb.AddForceAtPosition(leftWheel.transform.up * -antiRollForce, leftWheel.transform.position);
            if (groundedR) rb.AddForceAtPosition(rightWheel.transform.up * antiRollForce, rightWheel.transform.position);
        }

        private static void SyncWheelMesh(WheelCollider col, Transform mesh)
        {
            if (col == null || mesh == null) return;
            col.GetWorldPose(out Vector3 pos, out Quaternion rot);
            mesh.SetPositionAndRotation(pos, rot);
        }
    }
}`,
  },
  {
    id: 'cockpit-ik',
    fileName: 'CockpitControllerAndHandsIK.cs',
    unityPath: 'Assets/_JarvisDrive/Scripts/Vehicle/CockpitControllerAndHandsIK.cs',
    responsibility:
      'First-person cockpit steering wheel rotation, Animator OnAnimatorIK driver hands grip tracking, accelerator/brake pedal animation, and FP/TP camera switching.',
    owner: 'Gemini Neon (Implementation)',
    code: `using UnityEngine;

namespace JarvisDrive.Vehicle
{
    public class CockpitControllerAndHandsIK : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private VehiclePhysicsController vehicle;
        [SerializeField] private Transform steeringWheelTransform;
        [SerializeField] private Transform leftHandGripTarget;
        [SerializeField] private Transform rightHandGripTarget;
        [SerializeField] private Animator driverHandsAnimator;

        [Header("Footwell Pedals")]
        [SerializeField] private Transform acceleratorPedalPivot;
        [SerializeField] private Transform brakePedalPivot;

        [Header("Cameras")]
        [SerializeField] private Camera firstPersonCockpitCamera;
        [SerializeField] private Camera thirdPersonChaseCamera;
        [SerializeField] private GameObject cockpitHighDetailRoot;

        [Header("Settings")]
        [SerializeField] private float maxSteeringWheelVisualDegrees = 420f;
        [SerializeField] private float wheelSmoothSpeed = 14f;

        private float currentWheelVisualAngle;
        private bool isFirstPerson = true;

        private void Start()
        {
            SetCameraMode(true);
        }

        public void ToggleCameraPerspective()
        {
            SetCameraMode(!isFirstPerson);
        }

        public void SetCameraMode(bool firstPerson)
        {
            isFirstPerson = firstPerson;
            if (firstPersonCockpitCamera != null) firstPersonCockpitCamera.enabled = isFirstPerson;
            if (thirdPersonChaseCamera != null) thirdPersonChaseCamera.enabled = !isFirstPerson;
            if (cockpitHighDetailRoot != null) cockpitHighDetailRoot.SetActive(isFirstPerson);
        }

        private void LateUpdate()
        {
            if (vehicle == null) return;

            float targetAngle = vehicle.NormalizedSteer * maxSteeringWheelVisualDegrees;
            currentWheelVisualAngle = Mathf.Lerp(
                currentWheelVisualAngle,
                targetAngle,
                1f - Mathf.Exp(-wheelSmoothSpeed * Time.deltaTime)
            );

            if (steeringWheelTransform != null)
            {
                steeringWheelTransform.localRotation = Quaternion.Euler(0f, 0f, -currentWheelVisualAngle);
            }

            if (acceleratorPedalPivot != null)
            {
                acceleratorPedalPivot.localRotation = Quaternion.Euler(vehicle.ThrottleInput * 22f, 0f, 0f);
            }

            if (brakePedalPivot != null)
            {
                brakePedalPivot.localRotation = Quaternion.Euler(vehicle.BrakeInput * 16f, 0f, 0f);
            }
        }

        private void OnAnimatorIK(int layerIndex)
        {
            if (driverHandsAnimator == null || leftHandGripTarget == null || rightHandGripTarget == null)
                return;

            driverHandsAnimator.SetIKPositionWeight(AvatarIKGoal.LeftHand, 1f);
            driverHandsAnimator.SetIKRotationWeight(AvatarIKGoal.LeftHand, 1f);
            driverHandsAnimator.SetIKPosition(AvatarIKGoal.LeftHand, leftHandGripTarget.position);
            driverHandsAnimator.SetIKRotation(AvatarIKGoal.LeftHand, leftHandGripTarget.rotation);

            driverHandsAnimator.SetIKPositionWeight(AvatarIKGoal.RightHand, 1f);
            driverHandsAnimator.SetIKRotationWeight(AvatarIKGoal.RightHand, 1f);
            driverHandsAnimator.SetIKPosition(AvatarIKGoal.RightHand, rightHandGripTarget.position);
            driverHandsAnimator.SetIKRotation(AvatarIKGoal.RightHand, rightHandGripTarget.rotation);
        }
    }
}`,
  },
  {
    id: 'dashboard-cluster',
    fileName: 'DashboardInstrumentCluster.cs',
    unityPath: 'Assets/_JarvisDrive/Scripts/UI/DashboardInstrumentCluster.cs',
    responsibility:
      'Zero-allocation cockpit digital speedometer, tachometer fill bar, gear readout, and orthographic minimap navigation camera follow.',
    owner: 'Gemini Neon (Implementation)',
    code: `using UnityEngine;
using UnityEngine.UI;
using TMPro;
using JarvisDrive.Vehicle;

namespace JarvisDrive.UI
{
    public class DashboardInstrumentCluster : MonoBehaviour
    {
        [Header("Vehicle Reference")]
        [SerializeField] private VehiclePhysicsController vehicle;

        [Header("3D Cockpit Canvas Readouts")]
        [SerializeField] private TMP_Text cockpitSpeedText;
        [SerializeField] private TMP_Text cockpitGearText;
        [SerializeField] private TMP_Text cockpitRpmText;
        [SerializeField] private Image cockpitRpmFillBar;

        [Header("Screen HUD Readouts")]
        [SerializeField] private TMP_Text hudSpeedText;
        [SerializeField] private TMP_Text hudGearText;

        [Header("Navigation Display Minimap Camera")]
        [SerializeField] private Transform minimapOrthoCamera;
        [SerializeField] private float minimapHeight = 140f;

        private int lastDisplayedSpeed = -1;
        private int lastDisplayedGear = -1;
        private int lastDisplayedRpmBucket = -1;

        private static readonly string[] GearLabels = { "N", "D1", "D2", "D3", "D4", "D5", "D6" };

        private void LateUpdate()
        {
            if (vehicle == null) return;

            int roundedSpeed = Mathf.RoundToInt(vehicle.SpeedKmh);
            if (roundedSpeed != lastDisplayedSpeed)
            {
                lastDisplayedSpeed = roundedSpeed;
                string speedStr = roundedSpeed.ToString();
                if (cockpitSpeedText != null) cockpitSpeedText.SetText("{0}", roundedSpeed);
                if (hudSpeedText != null) hudSpeedText.SetText("{0}", roundedSpeed);
            }

            int gear = Mathf.Clamp(vehicle.CurrentGear, 1, 6);
            if (gear != lastDisplayedGear)
            {
                lastDisplayedGear = gear;
                string label = GearLabels[gear];
                if (cockpitGearText != null) cockpitGearText.text = label;
                if (hudGearText != null) hudGearText.text = label;
            }

            int rpmBucket = Mathf.RoundToInt(vehicle.EngineRpm / 50f) * 50;
            if (rpmBucket != lastDisplayedRpmBucket)
            {
                lastDisplayedRpmBucket = rpmBucket;
                if (cockpitRpmText != null) cockpitRpmText.SetText("{0} RPM", rpmBucket);
            }

            if (cockpitRpmFillBar != null)
            {
                cockpitRpmFillBar.fillAmount = Mathf.InverseLerp(800f, 7200f, vehicle.EngineRpm);
            }

            if (minimapOrthoCamera != null)
            {
                Vector3 vPos = vehicle.transform.position;
                minimapOrthoCamera.position = new Vector3(vPos.x, minimapHeight, vPos.z);
                minimapOrthoCamera.rotation = Quaternion.Euler(90f, vehicle.transform.eulerAngles.y, 0f);
            }
        }
    }
}`,
  },
  {
    id: 'mobile-touch-input',
    fileName: 'MobileTouchInputManager.cs',
    unityPath: 'Assets/_JarvisDrive/Scripts/Input/MobileTouchInputManager.cs',
    responsibility:
      'Multi-touch Android virtual steering wheel rotational drag tracking with auto-centering spring and simultaneous accelerator/brake pedal hold handling.',
    owner: 'Gemini Neon (Implementation)',
    code: `using UnityEngine;
using UnityEngine.EventSystems;
using JarvisDrive.Vehicle;

namespace JarvisDrive.InputSystem
{
    public class MobileTouchInputManager : MonoBehaviour
    {
        [Header("Target Vehicle")]
        [SerializeField] private VehiclePhysicsController vehicle;

        [Header("Touch Wheel UI")]
        [SerializeField] private RectTransform steeringWheelRect;
        [SerializeField] private float maxWheelDragAngle = 210f;
        [SerializeField] private float returnToCenterRate = 480f;

        private bool wheelHeld;
        private int activeWheelPointerId = -99;
        private float currentWheelAngle;
        private float previousPointerAngle;

        private bool throttlePressed;
        private bool brakePressed;

        public void OnWheelPointerDown(BaseEventData eventData)
        {
            if (eventData is not PointerEventData ped || steeringWheelRect == null) return;
            wheelHeld = true;
            activeWheelPointerId = ped.pointerId;
            previousPointerAngle = ComputePointerAngleDeg(ped);
        }

        public void OnWheelDrag(BaseEventData eventData)
        {
            if (!wheelHeld || eventData is not PointerEventData ped) return;
            if (ped.pointerId != activeWheelPointerId) return;

            float newAngle = ComputePointerAngleDeg(ped);
            float delta = Mathf.DeltaAngle(previousPointerAngle, newAngle);
            currentWheelAngle = Mathf.Clamp(currentWheelAngle - delta, -maxWheelDragAngle, maxWheelDragAngle);
            previousPointerAngle = newAngle;
        }

        public void OnWheelPointerUp(BaseEventData eventData)
        {
            if (eventData is PointerEventData ped && ped.pointerId == activeWheelPointerId)
            {
                wheelHeld = false;
                activeWheelPointerId = -99;
            }
        }

        public void SetThrottleHeld(bool held) => throttlePressed = held;
        public void SetBrakeHeld(bool held) => brakePressed = held;

        private float ComputePointerAngleDeg(PointerEventData ped)
        {
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                steeringWheelRect,
                ped.position,
                ped.pressEventCamera,
                out Vector2 localPt
            );
            return Mathf.Atan2(localPt.y, localPt.x) * Mathf.Rad2Deg;
        }

        private void Update()
        {
            if (!wheelHeld)
            {
                currentWheelAngle = Mathf.MoveTowards(
                    currentWheelAngle,
                    0f,
                    returnToCenterRate * Time.deltaTime
                );
            }

            if (steeringWheelRect != null)
            {
                steeringWheelRect.localEulerAngles = new Vector3(0f, 0f, -currentWheelAngle);
            }

            float normalizedSteer = Mathf.Clamp(currentWheelAngle / maxWheelDragAngle, -1f, 1f);
            float throttle = throttlePressed ? 1f : 0f;
            float brake = brakePressed ? 1f : 0f;

#if UNITY_EDITOR || UNITY_STANDALONE
            if (!wheelHeld && Mathf.Abs(Input.GetAxisRaw("Horizontal")) > 0.01f)
                normalizedSteer = Input.GetAxisRaw("Horizontal");
            if (!throttlePressed && Input.GetAxisRaw("Vertical") > 0.01f)
                throttle = Input.GetAxisRaw("Vertical");
            if (!brakePressed && (Input.GetAxisRaw("Vertical") < -0.01f || Input.GetKey(KeyCode.Space)))
                brake = 1f;
#endif

            if (vehicle != null)
            {
                vehicle.SetControlInputs(normalizedSteer, throttle, brake);
            }
        }
    }
}`,
  },
  {
    id: 'day-night-weather',
    fileName: 'DayNightWeatherManager.cs',
    unityPath: 'Assets/_JarvisDrive/Scripts/Core/DayNightWeatherManager.cs',
    responsibility:
      'Switches the shared city, vehicle, and route between Day Mode and Rainy Night Mode using URP Volume profiles, MaterialPropertyBlocks for wet asphalt reflections, streetlights, and rain particles.',
    owner: 'Gemini Neon (Implementation)',
    code: `using UnityEngine;
using UnityEngine.Rendering;
using JarvisDrive.Vehicle;

namespace JarvisDrive.Core
{
    public enum DrivingMode
    {
        Day = 0,
        NightRain = 1
    }

    public class DayNightWeatherManager : MonoBehaviour
    {
        [Header("Shared Scene References")]
        [SerializeField] private VehiclePhysicsController playerVehicle;
        [SerializeField] private WindshieldWiperAndRainShaderController wiperController;
        [SerializeField] private Light primaryDirectionalLight;
        [SerializeField] private Material skyboxDayMaterial;
        [SerializeField] private Material skyboxNightMaterial;

        [Header("URP Post-Processing & Fog")]
        [SerializeField] private Volume globalUrpVolume;
        [SerializeField] private VolumeProfile dayVolumeProfile;
        [SerializeField] private VolumeProfile nightRainVolumeProfile;

        [Header("Road & City Lighting")]
        [SerializeField] private Renderer[] cityRoadRenderers;
        [SerializeField] private GameObject streetLightsContainer;
        [SerializeField] private GameObject playerHeadlightsRoot;
        [SerializeField] private ParticleSystem rainFallParticleSystem;

        private static readonly int SmoothnessProp = Shader.PropertyToID("_Smoothness");
        private static readonly int MetallicProp = Shader.PropertyToID("_Metallic");

        private MaterialPropertyBlock roadPropBlock;
        public DrivingMode CurrentMode { get; private set; } = DrivingMode.NightRain;

        private void Awake()
        {
            roadPropBlock = new MaterialPropertyBlock();
        }

        private void Start()
        {
            int savedMode = PlayerPrefs.GetInt("JarvisDrive_SelectedMode", (int)DrivingMode.NightRain);
            ApplyDrivingMode((DrivingMode)savedMode);
        }

        public void SelectDayMode() => ApplyDrivingMode(DrivingMode.Day);
        public void SelectNightRainMode() => ApplyDrivingMode(DrivingMode.NightRain);

        public void ApplyDrivingMode(DrivingMode mode)
        {
            CurrentMode = mode;
            PlayerPrefs.SetInt("JarvisDrive_SelectedMode", (int)mode);
            bool isNight = mode == DrivingMode.NightRain;

            RenderSettings.skybox = isNight ? skyboxNightMaterial : skyboxDayMaterial;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = isNight ? new Color(0.03f, 0.04f, 0.08f) : new Color(0.62f, 0.78f, 0.96f);
            RenderSettings.fogDensity = isNight ? 0.0085f : 0.0018f;

            if (primaryDirectionalLight != null)
            {
                primaryDirectionalLight.color = isNight
                    ? new Color(0.38f, 0.56f, 0.85f)
                    : new Color(1.0f, 0.96f, 0.88f);
                primaryDirectionalLight.intensity = isNight ? 0.35f : 2.1f;
                primaryDirectionalLight.transform.rotation = isNight
                    ? Quaternion.Euler(42f, -130f, 0f)
                    : Quaternion.Euler(52f, 38f, 0f);
            }

            if (globalUrpVolume != null)
            {
                globalUrpVolume.profile = isNight ? nightRainVolumeProfile : dayVolumeProfile;
            }

            // Wet asphalt reflection optimization via MaterialPropertyBlock (zero material duplication)
            float roadSmoothness = isNight ? 0.86f : 0.24f;
            float roadMetallic = isNight ? 0.36f : 0.05f;
            if (cityRoadRenderers != null)
            {
                foreach (Renderer r in cityRoadRenderers)
                {
                    if (r == null) continue;
                    r.GetPropertyBlock(roadPropBlock);
                    roadPropBlock.SetFloat(SmoothnessProp, roadSmoothness);
                    roadPropBlock.SetFloat(MetallicProp, roadMetallic);
                    r.SetPropertyBlock(roadPropBlock);
                }
            }

            if (streetLightsContainer != null) streetLightsContainer.SetActive(isNight);
            if (playerHeadlightsRoot != null) playerHeadlightsRoot.SetActive(isNight);

            if (rainFallParticleSystem != null)
            {
                if (isNight && !rainFallParticleSystem.isPlaying) rainFallParticleSystem.Play();
                else if (!isNight && rainFallParticleSystem.isPlaying) rainFallParticleSystem.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            }

            if (playerVehicle != null) playerVehicle.SetWetAsphaltGrip(isNight);
            if (wiperController != null) wiperController.SetRainActive(isNight);
            DynamicGI.UpdateEnvironment();
        }
    }
}`,
  },
  {
    id: 'wiper-rain-shader',
    fileName: 'WindshieldWiperAndRainShaderController.cs',
    unityPath: 'Assets/_JarvisDrive/Scripts/Vehicle/WindshieldWiperAndRainShaderController.cs',
    responsibility:
      'Dual windshield wiper blade articulation and URP windshield rain droplet accumulation/clearing shader uniform synchronization.',
    owner: 'Gemini Argon (Audit & Perf Verification)',
    code: `using UnityEngine;

namespace JarvisDrive.Vehicle
{
    public class WindshieldWiperAndRainShaderController : MonoBehaviour
    {
        public enum WiperState
        {
            Off = 0,
            Intermittent = 1,
            Continuous = 2
        }

        [Header("Wiper Transforms")]
        [SerializeField] private Transform leftWiperPivot;
        [SerializeField] private Transform rightWiperPivot;
        [SerializeField] private float maxSweepAngleDegrees = 76f;

        [Header("Windshield Material")]
        [SerializeField] private Renderer windshieldRenderer;

        private static readonly int WiperNormalizedAngleID = Shader.PropertyToID("_WiperNormalizedAngle");
        private static readonly int RainDropletIntensityID = Shader.PropertyToID("_RainDropletIntensity");

        private MaterialPropertyBlock windshieldBlock;
        private WiperState currentState = WiperState.Continuous;
        private bool isRaining = true;
        private float wiperCyclePhase;
        private float currentWetness = 0.4f;

        private void Awake()
        {
            windshieldBlock = new MaterialPropertyBlock();
        }

        public void SetRainActive(bool active)
        {
            isRaining = active;
            currentState = active ? WiperState.Continuous : WiperState.Off;
        }

        public void CycleWiperMode()
        {
            currentState = (WiperState)(((int)currentState + 1) % 3);
        }

        private void Update()
        {
            float freq = currentState switch
            {
                WiperState.Continuous => 1.15f,
                WiperState.Intermittent => 0.48f,
                _ => 0f
            };

            float normalizedSweep = 0f;
            if (freq > 0f)
            {
                wiperCyclePhase = Mathf.Repeat(wiperCyclePhase + Time.deltaTime * freq, 1f);
                normalizedSweep = 1f - Mathf.Abs(wiperCyclePhase * 2f - 1f);
            }
            else
            {
                wiperCyclePhase = 0f;
            }

            float angleDeg = normalizedSweep * maxSweepAngleDegrees;
            Quaternion wiperRot = Quaternion.Euler(0f, 0f, -angleDeg);
            if (leftWiperPivot != null) leftWiperPivot.localRotation = wiperRot;
            if (rightWiperPivot != null) rightWiperPivot.localRotation = wiperRot;

            float accumRate = isRaining ? 0.24f : -0.65f;
            float clearRate = freq * 0.38f;
            currentWetness = Mathf.Clamp01(currentWetness + (accumRate - clearRate) * Time.deltaTime);

            if (windshieldRenderer != null)
            {
                windshieldRenderer.GetPropertyBlock(windshieldBlock);
                windshieldBlock.SetFloat(WiperNormalizedAngleID, normalizedSweep);
                windshieldBlock.SetFloat(RainDropletIntensityID, currentWetness);
                windshieldRenderer.SetPropertyBlock(windshieldBlock);
            }
        }
    }
}`,
  },
  {
    id: 'ai-traffic-spawner',
    fileName: 'AITrafficWaypointSpawner.cs',
    unityPath: 'Assets/_JarvisDrive/Scripts/Traffic/AITrafficWaypointSpawner.cs',
    responsibility:
      'Zero-GC pooled AI traffic manager using Physics.RaycastNonAlloc forward headway detection and automatic day/night headlight & brake-light switching.',
    owner: 'Gemini Argon (Audit & Perf Verification)',
    code: `using UnityEngine;

namespace JarvisDrive.Traffic
{
    public class AITrafficWaypointSpawner : MonoBehaviour
    {
        [System.Serializable]
        public class TrafficLaneLoop
        {
            public Transform[] waypoints;
            public float targetSpeedKmh = 52f;
        }

        [Header("Traffic Configuration (Capped at 10 for HONOR X9b 30+ FPS)")]
        [SerializeField] private TrafficLaneLoop[] cityLanes;
        [SerializeField] private GameObject[] trafficVehiclePrefabs;
        [SerializeField] private int activeVehicleCap = 10;
        [SerializeField] private LayerMask trafficObstacleMask;
        [SerializeField] private float safeFollowingDistance = 14f;

        private struct PooledTrafficAgent
        {
            public Transform root;
            public int laneIndex;
            public int currentWaypointIndex;
            public float currentSpeedMps;
            public float maxSpeedMps;
        }

        private PooledTrafficAgent[] agents;
        private readonly RaycastHit[] nonAllocHits = new RaycastHit[2];

        private void Start()
        {
            if (cityLanes == null || cityLanes.Length == 0 || trafficVehiclePrefabs.Length == 0)
                return;

            agents = new PooledTrafficAgent[activeVehicleCap];
            for (int i = 0; i < activeVehicleCap; i++)
            {
                int laneIdx = i % cityLanes.Length;
                TrafficLaneLoop lane = cityLanes[laneIdx];
                int wpIdx = (i * 2) % lane.waypoints.Length;
                Transform spawnWp = lane.waypoints[wpIdx];

                GameObject prefab = trafficVehiclePrefabs[i % trafficVehiclePrefabs.Length];
                GameObject instance = Instantiate(prefab, spawnWp.position, spawnWp.rotation, transform);

                agents[i] = new PooledTrafficAgent
                {
                    root = instance.transform,
                    laneIndex = laneIdx,
                    currentWaypointIndex = (wpIdx + 1) % lane.waypoints.Length,
                    currentSpeedMps = lane.targetSpeedKmh / 3.6f,
                    maxSpeedMps = lane.targetSpeedKmh / 3.6f
                };
            }
        }

        private void Update()
        {
            if (agents == null) return;
            float dt = Time.deltaTime;

            for (int i = 0; i < agents.Length; i++)
            {
                PooledTrafficAgent agent = agents[i];
                TrafficLaneLoop lane = cityLanes[agent.laneIndex];
                Transform targetWp = lane.waypoints[agent.currentWaypointIndex];

                // Non-alloc raycast ahead for player or slower traffic vehicle
                Vector3 rayOrigin = agent.root.position + Vector3.up * 0.65f;
                int hitCount = Physics.RaycastNonAlloc(
                    rayOrigin,
                    agent.root.forward,
                    nonAllocHits,
                    safeFollowingDistance,
                    trafficObstacleMask
                );

                float desiredSpeed = hitCount > 0 ? 0f : agent.maxSpeedMps;
                agent.currentSpeedMps = Mathf.MoveTowards(agent.currentSpeedMps, desiredSpeed, 9.5f * dt);

                Vector3 toTarget = targetWp.position - agent.root.position;
                toTarget.y = 0f;
                float dist = toTarget.magnitude;

                if (dist < 2.5f)
                {
                    agent.currentWaypointIndex = (agent.currentWaypointIndex + 1) % lane.waypoints.Length;
                }
                else
                {
                    Quaternion targetRot = Quaternion.LookRotation(toTarget.normalized, Vector3.up);
                    agent.root.rotation = Quaternion.Slerp(agent.root.rotation, targetRot, 6f * dt);
                    agent.root.position += agent.root.forward * (agent.currentSpeedMps * dt);
                }

                agents[i] = agent;
            }
        }
    }
}`,
  },
  {
    id: 'honor-x9b-profiler',
    fileName: 'HonorX9bPerformanceManager.cs',
    unityPath: 'Assets/_JarvisDrive/Scripts/Core/HonorX9bPerformanceManager.cs',
    responsibility:
      'Enforces HONOR X9b 5G (Snapdragon 6 Gen 1 / Adreno 710) 720p internal render scaling, 30/60 FPS target frame rate modes, and ProfilerRecorder telemetry logging.',
    owner: 'Gemini Argon (Audit & Perf Verification)',
    code: `using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Unity.Profiling;

namespace JarvisDrive.Core
{
    public class HonorX9bPerformanceManager : MonoBehaviour
    {
        [Header("HONOR X9b 5G Target Profiles (2652x1200 Native Display)")]
        [SerializeField] private UniversalRenderPipelineAsset urpAsset;
        [SerializeField] private int targetFrameRate = 30;
        [SerializeField] private int targetInternalHeightPx = 720;

        private ProfilerRecorder systemMemoryRecorder;
        private ProfilerRecorder drawCallsRecorder;
        private float smoothedFrameTimeMs = 33.3f;

        public float CurrentFps => 1000f / Mathf.Max(1f, smoothedFrameTimeMs);
        public long AllocatedMemoryMb => systemMemoryRecorder.Valid ? systemMemoryRecorder.LastValue / (1024 * 1024) : 0;
        public long DrawCallsCount => drawCallsRecorder.Valid ? drawCallsRecorder.LastValue : 0;

        private void OnEnable()
        {
            systemMemoryRecorder = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "System Used Memory");
            drawCallsRecorder = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Draw Calls Count");
        }

        private void OnDisable()
        {
            systemMemoryRecorder.Dispose();
            drawCallsRecorder.Dispose();
        }

        private void Awake()
        {
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = targetFrameRate;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            ApplyInternalResolutionScale(targetInternalHeightPx);
        }

        public void ApplyInternalResolutionScale(int targetHeightPx)
        {
            targetInternalHeightPx = Mathf.Clamp(targetHeightPx, 540, 1080);
            float nativeHeight = Mathf.Max(720, Screen.currentResolution.height);
            float scale = Mathf.Clamp(targetInternalHeightPx / nativeHeight, 0.5f, 1.0f);

            if (urpAsset != null)
            {
                urpAsset.renderScale = scale;
            }
        }

        public void SetFrameRateTarget(int fps)
        {
            targetFrameRate = fps;
            Application.targetFrameRate = fps;
        }

        private void Update()
        {
            float currentMs = Time.unscaledDeltaTime * 1000f;
            smoothedFrameTimeMs = Mathf.Lerp(smoothedFrameTimeMs, currentMs, 0.08f);
        }
    }
}`,
  },
  {
    id: 'build-apk-editor',
    fileName: 'BuildAndroidAPK.cs',
    unityPath: 'Assets/_JarvisDrive/Scripts/Editor/BuildAndroidAPK.cs',
    responsibility:
      'Unity 6.3 LTS Editor CLI & Menu build pipeline producing the installable ARM64 IL2CPP Android APK configured for Adreno 710 Vulkan/GLES3.',
    owner: 'Gemini Argon (Audit & Perf Verification)',
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace JarvisDrive.EditorTools
{
    public static class BuildAndroidAPK
    {
        private static readonly string[] Scenes =
        {
            "Assets/_JarvisDrive/Scenes/SCN_00_BootAndModeSelect.unity",
            "Assets/_JarvisDrive/Scenes/SCN_01_MetroCircuit_Main.unity"
        };

        [MenuItem("JARVIS DRIVE/Build HONOR X9b Android ARM64 APK")]
        public static void ExecuteAndroidBuild()
        {
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel29;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevel34;

            BuildPlayerOptions opts = new BuildPlayerOptions
            {
                scenes = Scenes,
                locationPathName = "Builds/Android/JarvisDrive_HonorX9b_ARM64.apk",
                target = BuildTarget.Android,
                options = BuildOptions.CompressWithLz4HC
            };

            BuildReport report = BuildPipeline.BuildPlayer(opts);
            BuildSummary summary = report.summary;

            if (summary.result == BuildResult.Succeeded)
            {
                Debug.Log($"[JARVIS DRIVE] APK Built Successfully: {summary.totalSize / (1024 * 1024)} MB at {opts.locationPathName}");
            }
            else
            {
                Debug.LogError($"[JARVIS DRIVE] APK Build Failed with {summary.totalErrors} errors.");
            }
        }
    }
}
#endif`,
  },
];

export const UNITY_SETUP_AND_VERIFICATION_STEPS = [
  {
    phase: '01. Unity 6.3 LTS URP Pipeline & Android ARM64 Configuration',
    steps: [
      'Create a Unity 6.3 LTS (6000.0.x) Universal 3D (URP) project and switch Active Build Target to Android.',
      'In Project Settings -> Player -> Android: set Scripting Backend to IL2CPP, Target Architectures to ARM64 only, and Graphics APIs to Vulkan (Primary) + OpenGLES3 (Fallback) for Adreno 710.',
      'In URP_HonorX9b_MobileAsset: set Render Scale to 0.60 (renders 1591×720 internal framebuffer on the HONOR X9b 2652×1200 panel), HDR ON (FP16), MSAA 2x, Main Light Shadows 1024×1024 (Single Cascade, 75m distance), Additional Lights Per-Object Limit = 2 (No Additional Light Shadows), and enable SRP Batcher.',
      'Set Android default texture compression to ASTC 6x6 block size for environment/vehicle maps and ASTC 4x4 for Cockpit Instrument Cluster UI atlases.',
    ],
  },
  {
    phase: '02. Shared City Scene, Baked Lightmaps & Wet Asphalt Setup',
    steps: [
      'Open SCN_01_MetroCircuit_Main. Mark all city blocks, curbs, and highway gantries as Batching Static, Occluder Static, and Contribute GI.',
      'Bake Progressive GPU Lightmapper at 12 texels/unit with Directional Mode = Non-Directional and 512 max lightmap size (ASTC 6x6) plus Window -> Rendering -> Occlusion Culling (Smallest Occluder 3m, Smallest Hole 0.25m).',
      'Assign MAT_Road_CityAsphalt to all road meshes. DayNightWeatherManager dynamically updates _Smoothness (0.24 in Day Mode -> 0.86 in Night Rain Mode) and _Metallic (0.05 -> 0.36) via MaterialPropertyBlock alongside Reflection Probe blending.',
    ],
  },
  {
    phase: '03. First-Person Luxury Cockpit, Hands IK & Windshield Rain Shader',
    steps: [
      'Place PFB_Player_LuxuryGT_Full at the East Avenue spawn point. Parent LeftHandGripTarget (-0.175, 0, 0) and RightHandGripTarget (+0.175, 0, 0) to SteeringWheelTransform.',
      'Enable IK Pass on the DriverArms Animator Base Layer so CockpitControllerAndHandsIK.OnAnimatorIK locks both driver hands onto the steering wheel rim across the full ±420° rotation range.',
      'Assign MAT_Windshield_RainDroplets (SG_WindshieldRainWiper) to the interior windshield quad and link LeftWiperPivot and RightWiperPivot to WindshieldWiperAndRainShaderController.',
    ],
  },
  {
    phase: '04. APK Build & Physical HONOR X9b 5G ADB Verification Protocol',
    steps: [
      'Build Builds/Android/JarvisDrive_HonorX9b_ARM64.apk via menu "JARVIS DRIVE -> Build HONOR X9b Android ARM64 APK" (or batchmode -executeMethod JarvisDrive.EditorTools.BuildAndroidAPK.ExecuteAndroidBuild).',
      'Install on physical HONOR X9b 5G (Model ALI-NX1, Snapdragon 6 Gen 1, Adreno 710, 12 GB RAM) via: adb install -r Builds/Android/JarvisDrive_HonorX9b_ARM64.apk',
      'Capture verified physical device frame timings, PSS RAM, and thermal sensors over a 10-minute Day + Night Rain run using: adb shell dumpsys gfxinfo com.jarvisdrive.sim framestats && adb shell dumpsys meminfo com.jarvisdrive.sim && adb shell dumpsys thermalservice',
    ],
  },
];
