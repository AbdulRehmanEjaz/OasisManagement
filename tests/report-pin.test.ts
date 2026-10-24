import test from "node:test";
import assert from "node:assert/strict";
import { reportPinLabel } from "../src/lib/report-pin";
test("Waste and Facilities map pins use report codes, independent of ordering", () => {
 for(const prefix of ["COSA", "OFT"]){
  const reports=[`${prefix}-012`,`${prefix}-001`,`${prefix}-100`,`${prefix}-002`];
  assert.deepEqual(reports.map(reportPinLabel),["12","01","100","02"]);
  assert.deepEqual(reports.toReversed().map(reportPinLabel),["02","100","01","12"]);
 }
});
test("Map label reflects renumbering and never inserts arbitrary HTML",()=>{
 assert.equal(reportPinLabel("OFT-002"),"02");assert.equal(reportPinLabel("OFT-001"),"01");
 for(const value of [undefined,null,"",'<img src=x onerror=alert(1)>',"OTHER-001"])assert.equal(reportPinLabel(value),"•");
});
