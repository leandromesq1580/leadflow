import test from 'node:test'
import assert from 'node:assert/strict'
import { campaignEngagementSummary, formatCampaignRate } from '../src/lib/email-campaign-engagement'

test('rates use delivered recipients, one decimal in Portuguese, not the entire audience',()=>{
 assert.equal(formatCampaignRate(149,379),'39,3% dos entregues')
 assert.equal(formatCampaignRate(7,379),'1,8% dos entregues')
 assert.equal(formatCampaignRate(0,379),'0% dos entregues')
 assert.equal(formatCampaignRate(0,0),'—')
})
test('list summary exposes both unique rates, including zero clicks when tracked',()=>{
 assert.equal(campaignEngagementSummary({total:3273,delivered:379,opened:149,unopened:230,clicked:7},{open:true,click:true}),'3273 destinatários · 379 entregues · 149 aberturas (39,3%) · 230 sem abertura · 7 cliques (1,8%)')
 assert.match(campaignEngagementSummary({total:10,delivered:5,opened:0,clicked:0},{open:true,click:true}),/0 aberturas \(0%\).*0 cliques \(0%\)/)
})
test('unknown or disabled tracking must not imply zero opens/clicks or show a rate',()=>{
 for(const tracking of [null,undefined,{open:false,click:false},{open:null,click:null}])assert.equal(campaignEngagementSummary({total:10,delivered:5,opened:3,clicked:2},tracking),'10 destinatários · 5 entregues')
 assert.equal(campaignEngagementSummary({total:10,delivered:5,opened:3,clicked:2},{open:true,click:false}),'10 destinatários · 5 entregues · 3 aberturas (60%) · 0 sem abertura')
 assert.equal(campaignEngagementSummary({total:10,delivered:5,opened:3,clicked:2},{open:false,click:true}),'10 destinatários · 5 entregues · 2 cliques (40%)')
})
test('empty delivered base stays unavailable and uncertain results remain visible',()=>{
 assert.equal(campaignEngagementSummary({total:10,unknown:2},{open:true,click:true}),'10 destinatários · 0 entregues · 0 aberturas (—) · 0 sem abertura · 0 cliques (—) · 2 resultados incertos')
})
