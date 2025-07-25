# -*- coding: utf-8 -*- #
# Copyright 2014 Google LLC. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Commands for reading and manipulating target HTTPS proxies."""

from __future__ import absolute_import
from __future__ import division
from __future__ import unicode_literals

from googlecloudsdk.calliope import base


@base.UniverseCompatible
@base.ReleaseTracks(
    base.ReleaseTrack.ALPHA, base.ReleaseTrack.BETA, base.ReleaseTrack.GA)
class TargetHTTPSProxies(base.Group):
  """List, create, and delete target HTTPS proxies."""


TargetHTTPSProxies.category = base.NETWORKING_CATEGORY

TargetHTTPSProxies.detailed_help = {
    'DESCRIPTION': """
        List, create, and delete target HTTPS proxies.

        For more information about target HTTPS proxies, see the
        [target HTTPS proxies documentation](https://cloud.google.com/load-balancing/docs/target-proxies).

        See also: [Target HTTPS proxies API](https://cloud.google.com/compute/docs/reference/rest/v1/targetHttpsProxies)
        and
        [Regional target HTTPS proxies API](https://cloud.google.com/compute/docs/reference/rest/v1/regionTargetHttpsProxies).
    """,
}
