import json, re, urllib.request, urllib.parse, urllib.error
KC="http://localhost:8443"; GW="http://localhost:3000"

# ── Start (intake) forms — authored on each process StartEvent, so ops can change
# intake fields in Process Studio without code. Rendered at case creation; values
# seed the process variables. Field shape = {key,label,type,required,options?}. ──
FAULT_FORM = [
  {"key":"serviceAffected","label":"Service / element affected","type":"text","required":True},
  {"key":"faultImpact","label":"Impact scope","type":"select","required":True,"options":"single_site,multi_site,core_network,customer_affecting"},
  {"key":"symptom","label":"Observed symptom","type":"textarea","required":True},
  {"key":"alarmRef","label":"Alarm / NMS reference","type":"text","required":False},
  {"key":"accessRequired","label":"Site access / escort required","type":"checkbox","required":False},
]
CHANGE_FORM = [
  {"key":"changeCategory","label":"Change category","type":"select","required":True,"options":"standard,normal,emergency"},
  {"key":"changeWindow","label":"Proposed change window","type":"text","required":True},
  {"key":"servicesImpacted","label":"Services impacted","type":"textarea","required":True},
  {"key":"downtimeExpected","label":"Service downtime expected","type":"checkbox","required":False},
]
INCIDENT_FORM = [
  {"key":"affectedService","label":"Affected service","type":"text","required":True},
  {"key":"usersImpacted","label":"Users impacted","type":"select","required":True,"options":"single,department,site,org_wide"},
  {"key":"businessImpact","label":"Business impact","type":"textarea","required":True},
  {"key":"workaroundAvailable","label":"Workaround available","type":"checkbox","required":False},
]
PROBLEM_FORM = [
  {"key":"affectedService","label":"Affected service / CI","type":"text","required":True},
  {"key":"problemImpact","label":"Impact scope","type":"select","required":True,"options":"single_site,multi_site,core_network,customer_affecting"},
  {"key":"symptom","label":"Recurring symptom","type":"textarea","required":True},
  {"key":"relatedIncidents","label":"Related incident references","type":"text","required":False},
]
SPARE_FORM = [
  {"key":"partType","label":"Part / component","type":"text","required":True},
  {"key":"quantity","label":"Quantity","type":"number","required":True},
  {"key":"siteCode","label":"Destination site","type":"text","required":True},
  {"key":"faultyAssetRef","label":"Faulty asset reference","type":"text","required":False},
]
ASSET_FORM = [
  {"key":"assetRef","label":"Asset reference","type":"text","required":True},
  {"key":"fromSite","label":"From site","type":"text","required":True},
  {"key":"toSite","label":"To site","type":"text","required":True},
  {"key":"escortRequired","label":"Security escort required","type":"checkbox","required":False},
]
CONVOY_FORM = [
  {"key":"route","label":"Route (origin to destination)","type":"text","required":True},
  {"key":"departureWindow","label":"Departure window","type":"text","required":True},
  {"key":"vehicles","label":"Vehicles","type":"number","required":False},
  {"key":"highRisk","label":"High-risk corridor","type":"checkbox","required":False},
]
THEFT_FORM = [
  {"key":"assetRef","label":"Stolen / missing asset","type":"text","required":True},
  {"key":"siteCode","label":"Site","type":"text","required":True},
  {"key":"discoveredBy","label":"Discovered by","type":"text","required":False},
  {"key":"incidentSummary","label":"What happened","type":"textarea","required":True},
]
AUDIT_FORM = [
  {"key":"auditScope","label":"Audit scope","type":"text","required":True},
  {"key":"auditType","label":"Audit type","type":"select","required":True,"options":"physical_security,access_control,compliance,site_survey"},
  {"key":"siteCode","label":"Site / area","type":"text","required":True},
]
PDT_FORM = [
  {"key":"kpi","label":"Degraded KPI","type":"text","required":True},
  {"key":"affectedElement","label":"Affected element / cell","type":"text","required":True},
  {"key":"threshold","label":"Threshold breached","type":"text","required":False},
]
def form_attr(form):
    return 'activiti:formFields="%s"' % urllib.parse.quote(json.dumps(form))
def inject_start_form(xml, form):
    """Attach (or replace) the start form on the process StartEvent; ensure the
    activiti namespace is declared so the attribute resolves."""
    if 'xmlns:activiti=' not in xml:
        xml = xml.replace('<definitions ', '<definitions xmlns:activiti="http://activiti.org/bpmn" ', 1)
    xml = re.sub(r'(<startEvent\b[^>]*?)\s+activiti:formFields="[^"]*"', r'\1', xml)  # drop existing
    return re.sub(r'<startEvent\b', '<startEvent ' + form_attr(form) + ' ', xml, count=1)

tok=json.load(urllib.request.urlopen(urllib.request.Request(
  f"{KC}/realms/bpm/protocol/openid-connect/token",
  data=urllib.parse.urlencode({"client_id":"bpm-frontend","username":"admin","password":"Admin123!","grant_type":"password"}).encode(),
  headers={"Content-Type":"application/x-www-form-urlencoded"})))["access_token"]
def call(method,path,body=None):
    data=json.dumps(body).encode() if body is not None else None
    req=urllib.request.Request(GW+path,data=data,method=method,headers={"Authorization":f"Bearer {tok}","Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except: return e.code,{}

FAULT = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="fault_management" name="Fault Management" isExecutable="true">
    <startEvent id="start"/>
    <sequenceFlow id="s1" sourceRef="start" targetRef="validate"/>
    <userTask id="validate" name="Validate Fault" activiti:candidateGroups="noc"/>
    <sequenceFlow id="s2" sourceRef="validate" targetRef="classify"/>
    <userTask id="classify" name="Classify and Assess Impact" activiti:candidateGroups="noc"/>
    <sequenceFlow id="s3" sourceRef="classify" targetRef="assign"/>
    <userTask id="assign" name="Assign Support Group" activiti:candidateGroups="manager"/>
    <sequenceFlow id="s4" sourceRef="assign" targetRef="diagnose"/>
    <userTask id="diagnose" name="Initial Diagnosis" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="s5" sourceRef="diagnose" targetRef="res_gw"/>
    <exclusiveGateway id="res_gw" name="Resolution Path"/>
    <sequenceFlow id="s6" sourceRef="res_gw" targetRef="repair"><conditionExpression>${resolution == "resolved"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="s7" sourceRef="res_gw" targetRef="exc_request"><conditionExpression>${resolution == "exception"}</conditionExpression></sequenceFlow>
    <userTask id="repair" name="Restoration and Repair" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="s8" sourceRef="repair" targetRef="tech_val"/>
    <userTask id="tech_val" name="Technical Validation" activiti:candidateGroups="noc"/>
    <sequenceFlow id="s9" sourceRef="tech_val" targetRef="close"/>
    <userTask id="close" name="Root Cause and Closure" activiti:candidateGroups="noc"/>
    <sequenceFlow id="s10" sourceRef="close" targetRef="end_ok"/>
    <endEvent id="end_ok"/>
    <userTask id="exc_request" name="Request Exception" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="s11" sourceRef="exc_request" targetRef="exc_review"/>
    <userTask id="exc_review" name="Review and Approve Exception" activiti:candidateGroups="manager"/>
    <sequenceFlow id="s12" sourceRef="exc_review" targetRef="exc_gw"/>
    <exclusiveGateway id="exc_gw" name="Exception Approved"/>
    <sequenceFlow id="s13" sourceRef="exc_gw" targetRef="exc_monitor"><conditionExpression>${decision == "approve"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="s14" sourceRef="exc_gw" targetRef="diagnose"><conditionExpression>${decision == "reject"}</conditionExpression></sequenceFlow>
    <userTask id="exc_monitor" name="Exception Monitoring and Scheduled Review" activiti:candidateGroups="manager"/>
    <sequenceFlow id="s15" sourceRef="exc_monitor" targetRef="end_exc"/>
    <endEvent id="end_exc"/>
  </process>
</definitions>'''

CHANGE = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="change_management" name="Change Management" isExecutable="true">
    <startEvent id="start"/>
    <sequenceFlow id="c1" sourceRef="start" targetRef="assess"/>
    <userTask id="assess" name="Assess Change and Risk" activiti:candidateGroups="manager"/>
    <sequenceFlow id="c2" sourceRef="assess" targetRef="cab_approval"/>
    <userTask id="cab_approval" name="CAB Approval" activiti:candidateGroups="cab_member" activiti:formKey="approval"/>
    <sequenceFlow id="c3" sourceRef="cab_approval" targetRef="dec_gw"/>
    <exclusiveGateway id="dec_gw" name="Approved"/>
    <sequenceFlow id="c4" sourceRef="dec_gw" targetRef="implement"><conditionExpression>${decision == "approve"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="c5" sourceRef="dec_gw" targetRef="notify_reject"><conditionExpression>${decision == "reject"}</conditionExpression></sequenceFlow>
    <userTask id="implement" name="Implement Change" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="c6" sourceRef="implement" targetRef="validate_change"/>
    <userTask id="validate_change" name="Validate and Verify" activiti:candidateGroups="noc"/>
    <sequenceFlow id="c7" sourceRef="validate_change" targetRef="close_change"/>
    <userTask id="close_change" name="Close Change" activiti:candidateGroups="noc"/>
    <sequenceFlow id="c8" sourceRef="close_change" targetRef="end_done"/>
    <endEvent id="end_done"/>
    <userTask id="notify_reject" name="Notify Rejection" activiti:candidateGroups="manager"/>
    <sequenceFlow id="c9" sourceRef="notify_reject" targetRef="end_rejected"/>
    <endEvent id="end_rejected"/>
  </process>
</definitions>'''

def publish(name, slug, cat, xml):
    st,d=call("POST","/api/v1/processes/definitions",{"name":name,"slug":slug,"category":cat,"bpmn_xml":xml})
    if st not in (200,201): print(f"  create {slug} FAILED {st}: {d}"); return
    did=d["id"]; ver=d.get("version")
    ps,_=call("POST",f"/api/v1/processes/definitions/{did}/publish")
    sf,form=call("GET",f"/api/v1/processes/definitions/slug/{slug}/start-form")
    nf=len(form.get("fields",[])) if isinstance(form,dict) else 0
    print(f"  {slug}: created v{ver} ({did[:8]}), publish→{ps}, start-form fields={nf}")

publish("Fault Management","fault_management","Service Operations", inject_start_form(FAULT, FAULT_FORM))
publish("Change Management","change_management","Service Operations", inject_start_form(CHANGE, CHANGE_FORM))

# Incident Management — now with a Major Incident (P1) branch. After triage, a
# gateway routes Major incidents through declare → bridge → recovery(↺ updates)
# → post-incident review; normal incidents keep the investigate → resolve flow.
INCIDENT = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="incident_management" name="Incident Management" isExecutable="true">
    <startEvent id="start" name="Incident Reported"/>
    <sequenceFlow id="i1" sourceRef="start" targetRef="triage"/>
    <userTask id="triage" name="Triage Incident" activiti:candidateGroups="it_engineer">
      <extensionElements>
        <activiti:formProperty id="priority" name="Priority" type="enum" required="true">
          <activiti:value id="critical" name="P1 - Critical"/>
          <activiti:value id="high" name="P2 - High"/>
          <activiti:value id="medium" name="P3 - Medium"/>
          <activiti:value id="low" name="P4 - Low"/>
        </activiti:formProperty>
        <activiti:formProperty id="majorIncident" name="Declare Major Incident?" type="enum" required="true">
          <activiti:value id="no" name="No - normal handling"/>
          <activiti:value id="yes" name="Yes - P1 Major Incident"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="i2" sourceRef="triage" targetRef="mi_gw"/>
    <exclusiveGateway id="mi_gw" name="Major Incident?"/>
    <sequenceFlow id="i3" sourceRef="mi_gw" targetRef="assign"><conditionExpression>${majorIncident == "no"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="i4" sourceRef="mi_gw" targetRef="declare_mi"><conditionExpression>${majorIncident == "yes"}</conditionExpression></sequenceFlow>

    <userTask id="assign" name="Assign to Engineer" activiti:candidateGroups="manager"/>
    <sequenceFlow id="i5" sourceRef="assign" targetRef="investigate"/>
    <userTask id="investigate" name="Investigate" activiti:candidateGroups="it_engineer"/>
    <sequenceFlow id="i6" sourceRef="investigate" targetRef="resolve"/>
    <userTask id="resolve" name="Resolve Incident" activiti:candidateGroups="it_engineer">
      <extensionElements>
        <activiti:formProperty id="resolved" name="Resolved?" type="enum" required="true">
          <activiti:value id="yes" name="Yes"/>
          <activiti:value id="no" name="No - keep investigating"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="i7" sourceRef="resolve" targetRef="resolve_gw"/>
    <exclusiveGateway id="resolve_gw" name="Resolved?"/>
    <sequenceFlow id="i8" sourceRef="resolve_gw" targetRef="close"><conditionExpression>${resolved == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="i9" sourceRef="resolve_gw" targetRef="investigate"><conditionExpression>${resolved == "no"}</conditionExpression></sequenceFlow>

    <!-- Major Incident (P1) branch -->
    <userTask id="declare_mi" name="Declare Major Incident and Assign MIM" activiti:candidateGroups="manager"/>
    <sequenceFlow id="m1" sourceRef="declare_mi" targetRef="engage_bridge"/>
    <userTask id="engage_bridge" name="Open Incident Bridge and Notify Stakeholders" activiti:candidateGroups="manager"/>
    <sequenceFlow id="m2" sourceRef="engage_bridge" targetRef="mi_recovery"/>
    <userTask id="mi_recovery" name="Technical Recovery" activiti:candidateGroups="noc">
      <extensionElements>
        <activiti:formProperty id="restored" name="Service Restored?" type="enum" required="true">
          <activiti:value id="yes" name="Yes - service restored"/>
          <activiti:value id="no" name="No - recovery ongoing"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="m3" sourceRef="mi_recovery" targetRef="mi_gw2"/>
    <exclusiveGateway id="mi_gw2" name="Service Restored?"/>
    <sequenceFlow id="m4" sourceRef="mi_gw2" targetRef="mi_review"><conditionExpression>${restored == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="m5" sourceRef="mi_gw2" targetRef="mi_update"><conditionExpression>${restored == "no"}</conditionExpression></sequenceFlow>
    <userTask id="mi_update" name="Stakeholder Update" activiti:candidateGroups="manager"/>
    <sequenceFlow id="m6" sourceRef="mi_update" targetRef="mi_recovery"/>
    <userTask id="mi_review" name="Post-Incident Review (PIR)" activiti:candidateGroups="manager"/>
    <sequenceFlow id="m7" sourceRef="mi_review" targetRef="close"/>

    <userTask id="close" name="Close Incident" activiti:candidateGroups="manager"/>
    <sequenceFlow id="i10" sourceRef="close" targetRef="end"/>
    <endEvent id="end" name="Incident Closed"/>
  </process>
</definitions>'''
publish("Incident Management","incident_management","Service Operations", inject_start_form(INCIDENT, INCIDENT_FORM))

# Problem Management — ITIL: RCA loop → known-error/workaround → permanent fix
# (or monitor with workaround) → validate → close. NOC-owned; auto-runs for the
# PIR problems spawned by major incidents.
PROBLEM = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="problem_management" name="Problem Management" isExecutable="true">
    <startEvent id="start" name="Problem Logged"/>
    <sequenceFlow id="p1" sourceRef="start" targetRef="investigate"/>
    <userTask id="investigate" name="Root Cause Investigation" activiti:candidateGroups="noc">
      <extensionElements>
        <activiti:formProperty id="rootCauseFound" name="Root cause identified?" type="enum" required="true">
          <activiti:value id="yes" name="Yes - root cause found"/>
          <activiti:value id="no" name="No - keep investigating"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="p2" sourceRef="investigate" targetRef="rca_gw"/>
    <exclusiveGateway id="rca_gw" name="Root Cause Found?"/>
    <sequenceFlow id="p3" sourceRef="rca_gw" targetRef="document_ke"><conditionExpression>${rootCauseFound == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="p4" sourceRef="rca_gw" targetRef="investigate"><conditionExpression>${rootCauseFound == "no"}</conditionExpression></sequenceFlow>
    <userTask id="document_ke" name="Document Known Error and Workaround" activiti:candidateGroups="noc">
      <extensionElements>
        <activiti:formProperty id="permanentFix" name="Permanent fix required?" type="enum" required="true">
          <activiti:value id="yes" name="Yes - raise a fix"/>
          <activiti:value id="no" name="No - accept workaround and monitor"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="p5" sourceRef="document_ke" targetRef="fix_gw"/>
    <exclusiveGateway id="fix_gw" name="Permanent Fix?"/>
    <sequenceFlow id="p6" sourceRef="fix_gw" targetRef="implement_fix"><conditionExpression>${permanentFix == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="p7" sourceRef="fix_gw" targetRef="monitor"><conditionExpression>${permanentFix == "no"}</conditionExpression></sequenceFlow>
    <userTask id="implement_fix" name="Implement Permanent Fix" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="p8" sourceRef="implement_fix" targetRef="validate_fix"/>
    <userTask id="validate_fix" name="Validate Fix" activiti:candidateGroups="noc"/>
    <sequenceFlow id="p9" sourceRef="validate_fix" targetRef="close_problem"/>
    <userTask id="monitor" name="Monitor Workaround" activiti:candidateGroups="noc"/>
    <sequenceFlow id="p10" sourceRef="monitor" targetRef="close_problem"/>
    <userTask id="close_problem" name="Review and Close Problem" activiti:candidateGroups="noc"/>
    <sequenceFlow id="p11" sourceRef="close_problem" targetRef="end"/>
    <endEvent id="end" name="Problem Closed"/>
  </process>
</definitions>'''
publish("Problem Management","problem_management","Service Operations", inject_start_form(PROBLEM, PROBLEM_FORM))

# ── Field & Logistics processes ──────────────────────────────────────────────
SPARE = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="spare_parts" name="Spare Parts" isExecutable="true">
    <startEvent id="start" name="Part Requested"/>
    <sequenceFlow id="s1" sourceRef="start" targetRef="stock_check"/>
    <userTask id="stock_check" name="Stock Check" activiti:candidateGroups="logistics">
      <extensionElements>
        <activiti:formProperty id="inStock" name="In stock?" type="enum" required="true">
          <activiti:value id="yes" name="Yes - issue from stock"/>
          <activiti:value id="no" name="No - procure"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s2" sourceRef="stock_check" targetRef="stock_gw"/>
    <exclusiveGateway id="stock_gw" name="In Stock?"/>
    <sequenceFlow id="s3" sourceRef="stock_gw" targetRef="issue_part"><conditionExpression>${inStock == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="s4" sourceRef="stock_gw" targetRef="procure"><conditionExpression>${inStock == "no"}</conditionExpression></sequenceFlow>
    <userTask id="procure" name="Procure Part" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="s5" sourceRef="procure" targetRef="issue_part"/>
    <userTask id="issue_part" name="Issue Part" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="s6" sourceRef="issue_part" targetRef="dispatch"/>
    <userTask id="dispatch" name="Dispatch to Site" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="s7" sourceRef="dispatch" targetRef="install"/>
    <userTask id="install" name="Install / Replace" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="s8" sourceRef="install" targetRef="return_faulty"/>
    <userTask id="return_faulty" name="Return Faulty Part" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="s9" sourceRef="return_faulty" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>'''
publish("Spare Parts","spare_parts","Field & Logistics", inject_start_form(SPARE, SPARE_FORM))

ASSET = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="asset_movement" name="Asset Movement" isExecutable="true">
    <startEvent id="start" name="Movement Requested"/>
    <sequenceFlow id="a1" sourceRef="start" targetRef="validate_req"/>
    <userTask id="validate_req" name="Validate Movement Request" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="a2" sourceRef="validate_req" targetRef="approve"/>
    <userTask id="approve" name="Approve Movement" activiti:candidateGroups="manager">
      <extensionElements>
        <activiti:formProperty id="approved" name="Approved?" type="enum" required="true">
          <activiti:value id="yes" name="Yes"/>
          <activiti:value id="no" name="No - reject"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="a3" sourceRef="approve" targetRef="appr_gw"/>
    <exclusiveGateway id="appr_gw" name="Approved?"/>
    <sequenceFlow id="a4" sourceRef="appr_gw" targetRef="dispatch_asset"><conditionExpression>${approved == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="a5" sourceRef="appr_gw" targetRef="notify_reject"><conditionExpression>${approved == "no"}</conditionExpression></sequenceFlow>
    <userTask id="dispatch_asset" name="Prepare and Dispatch" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="a6" sourceRef="dispatch_asset" targetRef="in_transit"/>
    <userTask id="in_transit" name="In Transit Tracking" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="a7" sourceRef="in_transit" targetRef="receive"/>
    <userTask id="receive" name="Receive at Destination" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="a8" sourceRef="receive" targetRef="reconcile"/>
    <userTask id="reconcile" name="Reconcile Asset Register" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="a9" sourceRef="reconcile" targetRef="end_ok"/>
    <endEvent id="end_ok" name="Closed"/>
    <userTask id="notify_reject" name="Notify Rejection" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="a10" sourceRef="notify_reject" targetRef="end_rej"/>
    <endEvent id="end_rej" name="Rejected"/>
  </process>
</definitions>'''
publish("Asset Movement","asset_movement","Field & Logistics", inject_start_form(ASSET, ASSET_FORM))

CONVOY = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="convoy" name="Convoy" isExecutable="true">
    <startEvent id="start" name="Convoy Requested"/>
    <sequenceFlow id="v1" sourceRef="start" targetRef="plan"/>
    <userTask id="plan" name="Plan Convoy" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="v2" sourceRef="plan" targetRef="clearance"/>
    <userTask id="clearance" name="Security Clearance" activiti:candidateGroups="security">
      <extensionElements>
        <activiti:formProperty id="cleared" name="Cleared to travel?" type="enum" required="true">
          <activiti:value id="yes" name="Yes - cleared"/>
          <activiti:value id="no" name="No - revise plan"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="v3" sourceRef="clearance" targetRef="clr_gw"/>
    <exclusiveGateway id="clr_gw" name="Cleared?"/>
    <sequenceFlow id="v4" sourceRef="clr_gw" targetRef="assign_escort"><conditionExpression>${cleared == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="v5" sourceRef="clr_gw" targetRef="plan"><conditionExpression>${cleared == "no"}</conditionExpression></sequenceFlow>
    <userTask id="assign_escort" name="Assign Escort" activiti:candidateGroups="security"/>
    <sequenceFlow id="v6" sourceRef="assign_escort" targetRef="travel"/>
    <userTask id="travel" name="Execute Travel" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="v7" sourceRef="travel" targetRef="arrival"/>
    <userTask id="arrival" name="Confirm Arrival" activiti:candidateGroups="noc"/>
    <sequenceFlow id="v8" sourceRef="arrival" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>'''
publish("Convoy","convoy","Field & Logistics", inject_start_form(CONVOY, CONVOY_FORM))

# ── Security processes ───────────────────────────────────────────────────────
THEFT = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="theft" name="Theft" isExecutable="true">
    <startEvent id="start" name="Theft Reported"/>
    <sequenceFlow id="t1" sourceRef="start" targetRef="secure_scene"/>
    <userTask id="secure_scene" name="Secure Scene and Assess" activiti:candidateGroups="security"/>
    <sequenceFlow id="t2" sourceRef="secure_scene" targetRef="investigate"/>
    <userTask id="investigate" name="Investigate" activiti:candidateGroups="security">
      <extensionElements>
        <activiti:formProperty id="recovered" name="Asset recovered?" type="enum" required="true">
          <activiti:value id="yes" name="Yes - recovered"/>
          <activiti:value id="no" name="No - file report"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="t3" sourceRef="investigate" targetRef="rec_gw"/>
    <exclusiveGateway id="rec_gw" name="Recovered?"/>
    <sequenceFlow id="t4" sourceRef="rec_gw" targetRef="recover"><conditionExpression>${recovered == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="t5" sourceRef="rec_gw" targetRef="file_fir"><conditionExpression>${recovered == "no"}</conditionExpression></sequenceFlow>
    <userTask id="recover" name="Recover and Reinstate Asset" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="t6" sourceRef="recover" targetRef="close"/>
    <userTask id="file_fir" name="File Police Report (FIR)" activiti:candidateGroups="security"/>
    <sequenceFlow id="t7" sourceRef="file_fir" targetRef="write_off"/>
    <userTask id="write_off" name="Asset Write-Off" activiti:candidateGroups="logistics"/>
    <sequenceFlow id="t8" sourceRef="write_off" targetRef="close"/>
    <userTask id="close" name="Review and Close" activiti:candidateGroups="security"/>
    <sequenceFlow id="t9" sourceRef="close" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>'''
publish("Theft","theft","Security Operations", inject_start_form(THEFT, THEFT_FORM))

AUDIT = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="security_audit" name="Security Audit" isExecutable="true">
    <startEvent id="start" name="Audit Raised"/>
    <sequenceFlow id="u1" sourceRef="start" targetRef="schedule"/>
    <userTask id="schedule" name="Schedule Audit" activiti:candidateGroups="security"/>
    <sequenceFlow id="u2" sourceRef="schedule" targetRef="conduct"/>
    <userTask id="conduct" name="Conduct Audit" activiti:candidateGroups="security">
      <extensionElements>
        <activiti:formProperty id="findings" name="Findings raised?" type="enum" required="true">
          <activiti:value id="yes" name="Yes - remediation needed"/>
          <activiti:value id="no" name="No - compliant"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="u3" sourceRef="conduct" targetRef="find_gw"/>
    <exclusiveGateway id="find_gw" name="Findings?"/>
    <sequenceFlow id="u4" sourceRef="find_gw" targetRef="remediate"><conditionExpression>${findings == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="u5" sourceRef="find_gw" targetRef="close"><conditionExpression>${findings == "no"}</conditionExpression></sequenceFlow>
    <userTask id="remediate" name="Remediate Findings" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="u6" sourceRef="remediate" targetRef="verify"/>
    <userTask id="verify" name="Verify Remediation" activiti:candidateGroups="security"/>
    <sequenceFlow id="u7" sourceRef="verify" targetRef="close"/>
    <userTask id="close" name="Close Audit" activiti:candidateGroups="security"/>
    <sequenceFlow id="u8" sourceRef="close" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>'''
publish("Security Audit","security_audit","Security Operations", inject_start_form(AUDIT, AUDIT_FORM))

# ── Performance ──────────────────────────────────────────────────────────────
PDT = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="pdt" name="Performance Degradation" isExecutable="true">
    <startEvent id="start" name="Degradation Detected"/>
    <sequenceFlow id="d1" sourceRef="start" targetRef="analyze"/>
    <userTask id="analyze" name="Analyze Performance" activiti:candidateGroups="field_engineer">
      <extensionElements>
        <activiti:formProperty id="actionNeeded" name="Tuning required?" type="enum" required="true">
          <activiti:value id="yes" name="Yes - tune"/>
          <activiti:value id="no" name="No - within tolerance"/>
        </activiti:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="d2" sourceRef="analyze" targetRef="pdt_gw"/>
    <exclusiveGateway id="pdt_gw" name="Tuning Needed?"/>
    <sequenceFlow id="d3" sourceRef="pdt_gw" targetRef="tune"><conditionExpression>${actionNeeded == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="d4" sourceRef="pdt_gw" targetRef="close"><conditionExpression>${actionNeeded == "no"}</conditionExpression></sequenceFlow>
    <userTask id="tune" name="Apply Optimisation" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="d5" sourceRef="tune" targetRef="validate"/>
    <userTask id="validate" name="Validate Improvement" activiti:candidateGroups="noc"/>
    <sequenceFlow id="d6" sourceRef="validate" targetRef="close"/>
    <userTask id="close" name="Close" activiti:candidateGroups="field_engineer"/>
    <sequenceFlow id="d7" sourceRef="close" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>'''
publish("Performance Degradation","pdt","Service Operations", inject_start_form(PDT, PDT_FORM))
