Pod::Spec.new do |s|
  s.name = 'L4pStorekit'
  s.version = '1.0.0'
  s.summary = 'Minimal StoreKit 2 subscription plugin'
  s.license = 'MIT'
  s.homepage = 'https://lead4producers.com'
  s.author = 'Lead4Pro'
  s.source = { :git => 'https://lead4producers.com', :tag => s.version.to_s }
  s.source_files = 'ios/Plugin/**/*.{swift,h,m}'
  s.ios.deployment_target = '13.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
