#!/usr/bin/env python3
import sys
import os
import sqlite3
import json
import datetime

DATA = json.loads('''{
  "timestamp":"2026-10-18T13:14:54.663295+00:00",
  "app":"Envelope Print Manager",
  "parties":[
    {"party_name":"JODHPUR MEDICOSE","party_code":"MARG000892","address":"SHREE MOHANGADH","city":"JAISALMER","state":"RAJASTHAN","mobile_no":"9829012345","landline":"0291-2645120","email":"jodhpurmedicose@gmail.com","gst_no":"08ABCDE1234F1Z2","notes":"Express courier","is_active":true},
    {"party_name":"JAY SHREE TRADERS","party_code":"MARG000874","address":"101 GIDC ESTATE","city":"AHMEDABAD","state":"GUJARAT","mobile_no":"9876543210","landline":"079-25418900","email":"jayshreetraders@yahoo.com","gst_no":"24ABCDE5678G2Z1","notes":"Medical consignments","is_active":true},
    {"party_name":"JIGNESH ENTERPRISE","party_code":"MARG000883","address":"GIDC PHASE 2","city":"VADODARA","state":"GUJARAT","mobile_no":"9824098765","landline":"0265-2890123","email":"jignesh_ent@rediffmail.com","gst_no":"24XYZAB9876C1Z8","notes":"Priority","is_active":true},
    {"party_name":"J K PHARMA DISTRIBUTOR","party_code":"MARG000891","address":"MEDICINE COMPLEX","city":"SURAT","state":"GUJARAT","mobile_no":"9898011223","landline":"0261-2478901","email":"jkpharma@suratpharma.com","gst_no":"24LMNOP4321D1Z9","notes":"Priority morning dispatch","is_active":true},
    {"party_name":"JALARAM AGENCIES","party_code":"MARG000845","address":"GRAIN MARKET","city":"RAJKOT","state":"GUJARAT","mobile_no":"9426033445","landline":"0281-2234567","email":"jalaram_rajkot@gmail.com","gst_no":"24PQRSU8765E1Z4","notes":"","is_active":true},
    {"party_name":"JANTA MEDICALS","party_code":"MARG000853","address":"MAIN HOSPITAL ROAD","city":"JAIPUR","state":"RAJASTHAN","mobile_no":"9829567890","landline":"0141-2356789","email":"jantamedicals.jpr@gmail.com","gst_no":"08JKLMN3456H1Z3","notes":"Cold chain parcel","is_active":true},
    {"party_name":"AMBICA PHARMACEUTICALS","party_code":"MARG000036","address":"402 SHIVALIK PLAZA, IIM ROAD, PANJRAPOLE","city":"AHMEDABAD","state":"GUJARAT","mobile_no":"9825123456","landline":"079-26301234","email":"ambicapharma@ambica.com","gst_no":"24BCDEF2345J1Z7","notes":"","is_active":true},
    {"party_name":"BHAVANI MEDICAL AGENCY","party_code":"MARG000109","address":"STATION ROAD, BEHIND SBI BANK","city":"MEHSANA","state":"GUJARAT","mobile_no":"9824345678","landline":"02762-251234","email":"bhavani.agency@gmail.com","gst_no":"24CDEFG3456K1Z6","notes":"","is_active":true},
    {"party_name":"TIRUPATI HEALTHCARE","party_code":"MARG001522","address":"PLOT NO 88, ELECTRONIC ZONE, GIDC","city":"GANDHINAGAR","state":"GUJARAT","mobile_no":"9727123890","landline":"079-23214567","email":"tirupati.health@tirupati.in","gst_no":"24DEFGH4567L1Z5","notes":"Large cartons delivery","is_active":true},
    {"party_name":"SHREE KRISHNA DISTRIBUTORS","party_code":"MARG001401","address":"CIVIL HOSPITAL CHOWK, STATION ROAD","city":"BHAVNAGAR","state":"GUJARAT","mobile_no":"9426987654","landline":"0278-2423456","email":"shreekrishna.dist@gmail.com","gst_no":"24EFGHI5678M1Z4","notes":"","is_active":true}
  ],
  "sender":{
    "business_name":"SHREEJI HEALTHCARE-HEALTHCARE",
    "address":"SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305",
    "city":"DEHGAM",
    "state":"GUJARAT",
    "mobile":"+91 99245 44283",
    "landline":"02716-245123",
    "email":"SHREEJISEVEN@GMAIL.COM",
    "gst_no":"24AAACS1234F1Z5"
  },
  "app_settings":{
    "default_envelope_size":"A4",
    "default_orientation":"Landscape",
    "default_copies":1,
    "default_printer":"Default System Printer",
    "margin_top_mm":15.0,
    "margin_left_mm":3.0,
    "margin_right_mm":3.0,
    "margin_bottom_mm":10.0,
    "scale_percent":100,
    "envelopes_per_page":1,
    "show_header":true,
    "show_barcode":true,
    "show_case_number":true,
    "show_weight":true,
    "show_mobile":true,
    "show_party_code":true
  }
}''')

print("Loaded sample data structure.")
